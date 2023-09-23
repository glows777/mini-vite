/* eslint-disable @typescript-eslint/no-use-before-define */
import type http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import process from 'node:process'

import type {
  BuildOptions as BuildOptions$1,
  Plugin as EsbuildPlugin,
  TransformOptions as EsbuildTransformOptions,
} from 'esbuild'
import {
  build,
} from 'esbuild'
import type { ChokidarOptions, RollupOptions } from 'rollup'
import fs, { existsSync, promises, unlinkSync, writeFileSync } from 'fs-extra'
import { red } from 'picocolors'

import type { Plugin, PluginOption } from './plugin'
import { DEFAULT_CONFIG_FILES } from './constants'
import {
  asyncFlatten,
  dynamicImport,
  isArray,
  isObject,
  lookupFile,
  normalizePath,
  transformArray,
} from './utils'
import type { PluginContainer } from './pluginContainer'
import { createPluginContainer } from './pluginContainer'
import { aliasPlugin } from './plugins/aliasPlugin'
import { assertPlugin, clientInjectPlugin, cssPlugin, esbuildTransformPlugin, importAnalysisPlugin, resolvePlugin, resolvePlugins } from './plugins'

type ChooseType<T> = T extends Promise<infer R> ? R : null

export declare type ResolvedConfig = ChooseType<
    ReturnType<typeof resolveConfig>
>

export declare interface InlineConfig extends UserConfig {
  configFile?: string | false
  envFile?: false
}

export declare interface UserConfig {
  root?: string
  base?: string
  mode?: string
  cacheDir?: string
  plugins?: PluginOption[]
  resolve?: ResolveOptions & {
    alias: AliasOptions
  }
  css?: cssOptions
  clearScreen?: boolean
  server?: ServerOptions
  optimizeDeps?: DepOptimizationOptions
  build?: BuildOptions | null
  publicDir?: string | false
}

export declare type AliasOptions = readonly Alias[] | { [find: string]: string }

export declare interface Alias {
  find: string | RegExp
  replacement: string
}

export declare interface ResolveOptions {
  mainFields?: string[]
  conditions?: string[]
  extensions?: string[]
  dedupe?: string[]
  preserveSymlinks?: boolean
}

export declare interface ServerOptions extends CommonServerOptions {
  hmr?: HmrOptions | boolean
  watch?: WatchOptions
  middlewareMode?: boolean | 'html' | 'ssr'
  base?: string
  fs?: FileSystemServeOptions
  origin?: string
  preTransformRequests?: boolean
  force?: boolean
}

export declare interface HmrOptions {
  protocol?: string
  host?: string
  port?: number
  clientPort?: number
  path?: string
  timeout?: number
  overlay?: boolean
  server?: http.Server
}

export declare interface FileSystemServeOptions {
  strict?: boolean
  allow?: string[]
  deny?: string[]
}

export declare type AnyMatchFn = (testString: string) => boolean

export declare type AnyMatchPattern = string | RegExp | AnyMatchFn

export declare type Matcher = AnyMatchPattern | AnyMatchPattern[]

export declare interface WatchOptions {
  ignored?: Matcher
  persistent?: boolean
  ignoreInitial?: boolean
  followSymlinks?: boolean
  cwd?: string
  disableGlobbing?: boolean
  usePolling?: boolean
  useFsEvents?: boolean
  alwaysStat?: boolean
  depth?: number
  interval?: number
  binaryInterval?: number
  ignorePermissionErrors?: boolean
  atomic?: boolean | number
  awaitWriteFinish?: boolean
}

export declare interface CommonServerOptions {
  port?: number
  host?: string | boolean
  open?: boolean | string
}

export declare interface DepOptimizationConfig {
  include?: string[]
  exclude?: string[]
  needsInterop?: string[]
  esbuildOptions?: Omit<
        BuildOptions$1,
        | 'bundle'
        | 'entryPoints'
        | 'external'
        | 'write'
        | 'watch'
        | 'outdir'
        | 'outfile'
        | 'outbase'
        | 'outExtension'
        | 'metafile'
    >
  extensions?: string[]
  disabled?: boolean | 'build' | 'dev'
}

export declare type DepOptimizationOptions = DepOptimizationConfig & {
  entries?: string | string[]
  force?: boolean
}

interface cssOptions {
  preprocessorOptions?: Record<string, any>
}

export interface WatcherOptions {
  buildDelay?: number
  chokidar?: ChokidarOptions
  clearScreen?: boolean
  exclude?: string | RegExp | (string | RegExp)[]
  include?: string | RegExp | (string | RegExp)[]
  skipWrite?: boolean
}

export declare type LibraryFormats = 'es' | 'cjs' | 'umd' | 'iife'

export declare interface LibraryOptions {
  entry: string
  name?: string
  formats?: LibraryFormats[]
  fileName?: string
}
export declare interface BuildOptions {
  target?: 'modules' | EsbuildTransformOptions['target'] | false
  polyfillModulePreload?: boolean
  outDir?: string
  assetsDir?: string
  ssr?: boolean | string
  assetsInlineLimit?: number
  cssCodeSplit?: boolean
  cssTarget?: EsbuildTransformOptions['target'] | false
  sourcemap?: boolean | 'inline' | 'hidden'
  minify?: boolean | 'terser' | 'esbuild'
  rollupOptions?: RollupOptions
  write?: boolean
  emptyOutDir?: boolean | null
  manifest?: boolean | string
  reportCompressedSize?: boolean
  chunkSizeWarningLimit?: number
  watch?: WatcherOptions | null
  lib?: LibraryOptions | false
}

export declare interface ConfigEnv {
  command: 'build' | 'serve'
  mode: string
}

interface NodeModuleWithCompile extends NodeModule {
  _compile(code: string, filename: string): any
}

export async function resolveConfig(
  inlineConfig: InlineConfig,
  command: 'serve' | 'build',
  defaultMode: 'development' | 'production' = 'development',
) {
  let config = inlineConfig
  let mode = config.mode || defaultMode
  let configFileDependencies: string[] = []

  if (mode === 'production')
    process.env.NODE_ENV = 'production'

  if (command === 'serve' && mode === 'production')
    process.env.NODE_ENV = 'development'

  const configEnv = {
    mode,
    command,
  }
  let { configFile } = config

  // * 这里 需要强制使用 !== false 因为，configFile 可以为空字符串 或者 undefined ,这代表着默认 configFile 的位置
  if (configFile !== false) {
    const loadedResult = await loadConfigFromFile(configEnv, configFile, config.root)
    if (loadedResult) {
      // 将 加载出来的 config 与 命令行 config 合并
      config = mergeConfig(loadedResult.config, config)
      configFile = loadedResult.path
      configFileDependencies = loadedResult.dependencies
    }
  }
  mode = config.mode || mode
  configEnv.mode = mode

  // 划分出 插件是否生效
  const rawUserPlugins = (
    (await asyncFlatten(config.plugins || [])) as Plugin[]
  ).filter((p) => {
    if (!p)
      return false
    else if (!p.apply)
      return true
    else if (typeof p.apply === 'function')
      return p.apply({ ...config, mode }, configEnv)
    else
      return (p as Plugin).apply === command
  })

  // 排序 plugin， 通过 enforce 属性的不同分为三种
  const [prePlugins, normalPlugins, postPlugins] = sortUserPlugins(rawUserPlugins)

  const userPlugins = [...prePlugins, ...normalPlugins, ...postPlugins]
  // 对用户插件调用 config 钩子， 进行配置更改
  for (const p of userPlugins) {
    if (p.config) {
      const res = await p.config(config, configEnv)
      if (res)
        config = mergeConfig(config, res)
    }
  }

  // * 获取 项目根目录
  const resolvedRoot = normalizePath(
    config.root ? path.resolve(config.root) : process.cwd(),
  )
  config.root = resolvedRoot

  // * 获取根目录的包路径
  const pkgPath = lookupFile(resolvedRoot, ['package.json'], {
    pathOnly: true,
  })

  // * 预构建构建 缓存的路径
  const cacheDir = config.cacheDir
    ? path.resolve(resolvedRoot, config.cacheDir)
    : pkgPath
    // * 如果 有 package.json ，则缓存到 node_modules 中
      ? path.join(path.dirname(pkgPath), 'node_modules/.m-vite')
    // * 没有的话 则 缓存路径为 项目根目录
      : path.join(resolvedRoot, '.m-vite')
  // * 如果没有这个目录，则创建一个
  if (!existsSync(cacheDir))
    await promises.mkdir(cacheDir)

  // * 初始化build参数
  const resolvedBuildOptions = resolveBuildOptions(config.build || {})

  // * 初始化 公共资源路径，默认为 process.cwd() + public
  const { publicDir } = config
  const resolvedPublicDir = publicDir !== false && publicDir !== ''
    ? path.resolve(resolvedRoot, typeof publicDir === 'string' ? publicDir : 'public')
    : ''

  const optimizeDeps = config.optimizeDeps || {}

  // * 创建 路径处理 的插件容器，未来会用于依赖预构建过程
  const createResolver = () => {
    let aliasContainer: PluginContainer
    // resolve 函数
    return async (id: string, importer?: string) => {
      const container = aliasContainer || (
        aliasContainer = await createPluginContainer({
          ...resolved,
          plugins: [aliasPlugin(resolved)],
        })
      )
      return (await container.resolveId(id, importer))!.id
    }
  }

  // 是否是 打包环境
  const isBuild = command === 'build'

  // * 合并 配置
  const resolvedConfig = {
    configFile: configFile ? normalizePath(configFile) : undefined,
    configFileDependencies: (configFileDependencies as string[]).map(name =>
      normalizePath(path.resolve(name)),
    ),
    inlineConfig,
    root: resolvedRoot,
    publicDir: resolvedPublicDir,
    cacheDir,
    command,
    mode,
    createResolver,
    isWorker: false,
    mainConfig: null,
    plugins: [] as Plugin[],
    build: resolvedBuildOptions,
    packageCache: new Map(),
    optimizeDeps: {
      disabled: 'build',
      ...optimizeDeps,
      esbuildOptions: {
        preserveSymlinks: config.resolve?.preserveSymlinks,
        ...optimizeDeps.esbuildOptions,
      },
    },
  }
  // todo resolve build option -> outDir assetsDir

  const resolved = {
    ...resolvedConfig,
    ...config,
  }
  resolved.build = resolvedBuildOptions
  // * 融合 内置 plugin
  const resolvedPlugins = resolvePlugins([
    aliasPlugin(resolved),
    ...(isBuild ? [] : [clientInjectPlugin()]),
    resolvePlugin(resolved),
    esbuildTransformPlugin(),
    cssPlugin(),
    // todo add buildImportAnalysisPlugin
    ...(isBuild ? [importAnalysisPlugin()] : [importAnalysisPlugin()]),
    assertPlugin(),
  ])

  resolved.plugins = resolvedPlugins

  // * 处理 alias 转化为 [{ find, replacement }] 的形式
  const alias = resolved.resolve?.alias
  const aliasArray: Alias[] = []
  if (isArray(alias)) {
    aliasArray.push(...alias)
  }
  else if (isObject(alias)) {
    aliasArray.push(
      ...Object.entries(alias as Record<string, string>).map(
        ([k, v]) => ({ find: k, replacement: v }),
      ),
    )
  }
  resolved.resolve && (resolved.resolve.alias = aliasArray)

  // * 执行 插件的 configResolved 钩子
  await Promise.all(userPlugins.map(p => p?.configResolved?.(resolved)))

  return resolved
}

export async function loadConfigFromFile(
  configEnv: ConfigEnv,
  configFile?: string,
  configRoot: string = process.cwd(), // 默认为process.cwd()
) {
  let resolvedPath: string | undefined

  // 解析 vite.config.x 文件路径
  if (configFile) {
    resolvedPath = path.resolve(configFile)
  }
  else {
    // * 不存在 configFile ,则默认从 process.cwd() 中寻找 vite.config.[mjs, cjs, mts, cts, js, ts] 类型的 config 文件
    for (const filename of DEFAULT_CONFIG_FILES) {
      const filePath = path.resolve(configRoot, filename)
      if (!existsSync(filePath))
        continue
      resolvedPath = filePath
      break
    }
  }
  // * 找不到 config 文件
  if (!resolvedPath) {
    console.log(red('🙅 未找到 config 文件, 请添加 config 文件～'))
    throw new Error('can not find a config file')
  }
  // console.log('====== resolvedPath', resolvedPath)

  // 标识是否是 EMS 格式
  let isESM = false
  // 以 mjs 结尾的则是 EMS 格式
  if (/\.m[jt]s$/.test(resolvedPath)) {
    isESM = true
  }
  // 以 cjs 结尾则是 CJS 格式
  else if (/\.c[jt]s$/.test(resolvedPath)) {
    isESM = false
  }
  // js 或则 ts 结尾，通过判断 package.json 的 module 字段来确定格式
  else {
    try {
      // 判断是否存在 package.json文件 且读取其内容
      const pkg = lookupFile(configRoot, ['package.json'])
      isESM = !!pkg && JSON.parse(pkg).type === 'module'
    }
    catch (e) { }
  }

  // 读取 config 文件
  try {
    // * 首先 先编译为 js 文件
    const bundled = await bundleConfigFile(resolvedPath, isESM)

    // * 加载 打包后的 js 代码
    const userConfig = await loadConfigFromBundledFile(resolvedPath, bundled.code, isESM)
    // console.log('========userConfig(bundled)', userConfig)
    if (!isObject(userConfig))
      throw new Error('config must export or return an object.')

    return {
      path: normalizePath(resolvedPath),
      config: userConfig,
      dependencies: bundled.dependencies,
    }
  }
  catch (e) { }
}

const dirnameVarName = '__vite_injected_original_dirname'
const filenameVarName = '__vite_injected_original_filename'
const importMetaUrlVarName = '__vite_injected_original_import_meta_url'
async function bundleConfigFile(filename: string, isESM: boolean): Promise<{ code: string; dependencies: string[] }> {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [filename],
    outfile: 'out.js',
    write: false, // * 这里不需要写入磁盘，直接从 返回结果的打包结果 result 拿就好了
    target: ['node14.18', 'node16'], // 打包版本
    platform: 'node', // 打包平台
    bundle: true,
    format: isESM ? 'esm' : 'cjs',
    sourcemap: 'inline',
    metafile: true,
    define: {
      // 定义全局变量
      '__dirname': dirnameVarName,
      '__filename': filenameVarName,
      'import.meta.url': importMetaUrlVarName,
    },
    plugins: [
      externalizeDepsPlugin(filename, isESM),
      injectFileScopeVariablesPlugin(),
    ],
  })

  const { text: code } = result.outputFiles[0]
  return {
    code,
    dependencies: result.metafile ? Object.keys(result.metafile.inputs) : [],
  }
}

function externalizeDepsPlugin(fileName: string, isESM: boolean): EsbuildPlugin {
  return {
    // 过滤不需要的 package 依赖
    name: 'esbuild:externalize-deps',
    setup(build) {
      build.onResolve({ filter: /.*/ }, ({ path: id, importer }) => {
        // 当前路径是 . 开头则直接排除 bare imports 只加入包依赖
        if (id[0] !== '.' && !path.isAbsolute(id)) {
          return {
            external: true,
          }
        }
        const idFsPath = path.resolve(path.dirname(importer), id)
        const idPkgPath = lookupFile(idFsPath, ['package.json'], {
          pathOnly: true,
        })
        if (idPkgPath) {
          const idPkgDir = path.dirname(idPkgPath)
          if (path.relative(idPkgDir, fileName).startsWith('..')) {
            return {
              path: isESM ? pathToFileURL(idFsPath).href : idFsPath,
              external: true,
            }
          }
        }
      })
    },
  }
}

function injectFileScopeVariablesPlugin(): EsbuildPlugin {
  return {
    name: 'inject-file-scope-variables',
    setup(build) {
      // 读取 package 文件注入 __dirname 属性值
      build.onLoad({ filter: /\.[cm]?[jt]s$/ }, async ({ path: id }) => {
        const contents = await promises.readFile(id, 'utf8')
        const injectValues
                    = `const ${dirnameVarName} = ${JSON.stringify(
                        path.dirname(id),
                    )};`
                    + `const ${filenameVarName} = ${JSON.stringify(id)};`
                    + `const ${importMetaUrlVarName} = ${JSON.stringify(
                        pathToFileURL(id).href,
                    )};`

        return {
          loader: id.endsWith('ts') ? 'ts' : 'js',
          contents: injectValues + contents,
        }
      })
    },
  }
}

const _require = createRequire(import.meta.url)
async function loadConfigFromBundledFile(
  fileName: string,
  bundledCode: string,
  isESM: boolean,
): Promise<UserConfig> {
  // 如果是 ESM 格式 先将打包后的内容写入到文件中 在通过 import 动态导入
  if (isESM) {
    const fileBase = `${fileName}.timestamp-${Date.now()}`
    const fileNameTmp = `${fileBase}.mjs`
    const fileUrl = `${pathToFileURL(fileBase)}.mjs`
    // 写入 编译后的文件
    writeFileSync(fileNameTmp, bundledCode)
    try {
      // * 动态导出文件
      // * 这里 dynamicImport 用 new Function 包裹
      // * 是为了避免打包工具处理这段代码，比如 Rollup 和 TSC，类似的手段还有 eval
      return (await dynamicImport(fileUrl)).default
    }
    finally {
      try {
        // 读取后，删除文件
        unlinkSync(fileNameTmp)
      }
      catch (e) { }
    }
  }
  else {
    // * 对于 cjs 格式, 则拦截 require.extensions['.js'] 方法
    // 拿到后缀
    const extension = path.extname(fileName)
    const realFileName = fs.realpathSync(fileName)
    // eslint-disable-next-line n/no-deprecated-api
    const loaderExtension = extension in require.extensions ? extension : '.js'

    // 先存一份 原来的 loader
    const defaultLoader = _require.extensions[loaderExtension]!

    // node 底层调用 module._compile 方法 然后编译完成后在 require
    _require.extensions[loaderExtension] = (module: NodeModule, filename: string) => {
      if (filename === realFileName)
        (module as NodeModuleWithCompile)._compile(bundledCode, filename)
      else
        defaultLoader(module, filename)
    }
    // 清除 缓存
    delete require.cache[require.resolve(fileName)]

    // * 完成编译后就可以通过 require 获取
    const raw = _require(fileName)
    // * 恢复 原来的 loader
    _require.extensions[loaderExtension] = defaultLoader
    return raw.__esModule ? raw.default : raw
  }
}

export function mergeConfig(
  defaults: Record<string, any>,
  overrides: Record<string, any>,
) {
  // 浅拷贝默认配置
  const merged = { ...defaults }
  for (const key in overrides) {
    const val = overrides[key]

    // 如果 val 是 null 则不需要覆盖
    if (val === null || val === undefined)
      continue

    const existing = merged[key]
    // 判断 defaults 中是否有 key 若没有则将 override 的值赋值到 defaults 上
    if (existing === null) {
      merged[key] = val
      continue
    }

    // 有的值 是数组，则进行合并
    if (isArray(existing) || isArray(val)) {
      merged[key] = [...transformArray(existing), ...transformArray(val)]
      continue
    }

    // 如果都是 对象，则 进行 深度合并， 递归
    if (isObject(existing) && isObject(val)) {
      merged[key] = mergeConfig(existing, val)
      continue
    }

    // 以上情况都不是，则直接覆盖
    merged[key] = val
  }
  return merged
}

function sortUserPlugins(plugins: Plugin[]) {
  const prePlugins: Plugin[] = []
  const postPlugins: Plugin[] = []
  const normalPlugins: Plugin[] = []

  if (plugins) {
    plugins.forEach((p) => {
      if (p.enforce === 'pre')
        prePlugins.push(p)
      else if (p.enforce === 'post')
        postPlugins.push(p)
      else
        normalPlugins.push(p)
    })
  }

  return [prePlugins, normalPlugins, postPlugins]
}

function resolveBuildOptions(raw: BuildOptions) {
  return raw
}
