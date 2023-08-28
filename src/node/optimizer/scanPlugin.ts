import path from 'node:path'
import type { Plugin } from 'esbuild'

import { existsSync, promises } from 'fs-extra'
import { parse } from 'es-module-lexer'
import { BARE_IMPORT_RE, EXTERNAL_TYPES, HTMLTypesRE, SRCRE, ScriptModuleRE, ScriptRE, TYPERE } from '../constants'
import type { ResolvedConfig } from '../config'
import { error, flattenId, getPkgModulePath } from '../utils'

export function scanPlugin(
  // 依赖映射表 { 'react/jsx-runtime': '实际入口路径' }
  deps: Record<string, string>,
  // 扁平化依赖 映射表 { 'react_jsx-runtime': '实际入口路径' }
  flatIdToImports: Record<string, string>,
  config: ResolvedConfig,
): Plugin {
  return {
    name: ' esbuild:scan-deps',
    setup(build) {
      // * 处理 html vue 文件
      build.onResolve(
        { filter: HTMLTypesRE },
        (resolveInfo) => {
          return {
            path: resolveInfo.path,
            namespace: 'html',
          }
        },
      )
      build.onLoad(
        { filter: HTMLTypesRE, namespace: 'html' },
        async (resolveInfo) => {
          let htmlPath = ''

          if (existsSync(resolveInfo.path))
            htmlPath = resolveInfo.path
          else
            htmlPath = path.resolve(config.root, resolveInfo.path)

          // * 如果 resolve 后，仍然找不到 该路径，则直接报错
          if (existsSync(htmlPath))
            error(`pluginError: 插件 [scanPlugin] 找不到'${htmlPath}', 根目录为 ${config.root}`)

          let contents = ''

          // * 读取 html 文件
          const htmlContent = await promises.readFile(htmlPath, 'utf-8')

          // * 解析 html 文件，读取 <script type="module" src="xxxx"></script> 中 src 指向的 xxx，并转为 import 语句嵌入
          // * 兜底：
          // * 没有 src 属性，则读取 <script type="module">xxx</script> 中 xxx 的内容
          // * 没有 module 属性的话，不做解析
          // * 只需要 解析一层即可

          let match: RegExpExecArray | null
          const isHtml = resolveInfo.path.endsWith('.html')
          // todo support for vue
          const isVue = resolveInfo.path.endsWith('.vue')
          const regex = isHtml ? ScriptModuleRE : ScriptRE

          // * 解析 html
          if (isHtml) {
            let match = regex.exec(htmlContent)
            while (match) {
              const [, openTag, content] = match

              // * <script type="xxx" src="xxx"> 拿到 type
              const typeMatch = openTag.match(TYPERE)
              const type = typeMatch && (typeMatch[1] || typeMatch[2] || typeMatch[3])

              // * type 不是 module 则跳过
              if (type !== 'module')
                continue

              // * 获取 src 属性
              const srcMatch = openTag.match(SRCRE)
              const src = srcMatch && (srcMatch[1] || srcMatch[2] || srcMatch[3])

              // * 存在 src 则将 src 转化为 import 语句，添加到 contents 中
              if (src) {
                if (src.startsWith('/'))
                  contents += `import ${JSON.stringify(`.${src}`)}\n`
                else
                  contents += `import ${JSON.stringify(src)}\n`
              }
              // * 不存在 src 则需要 分析 content 的内容
              else {
                const [imports] = parse(content)
                for (const info of imports) {
                  const { ss: variableStart, se: variableEnd } = info

                  // * 获取 import 语句 放入 contents 中
                  contents += `${content.slice(variableStart, variableEnd)}`
                }
              }
              match = regex.exec(htmlContent)
            }
          }
          return {
            loader: 'js',
            contents,
            resolveDir: config.root,
          }
        },
      )

      // 忽略的 文件类型
      build.onResolve(
        { filter: new RegExp(`\\.${EXTERNAL_TYPES.join('|')}$`) },
        (resolveInfo) => {
          return {
            path: resolveInfo.path,
            // 打上 external 标签
            external: true,
          }
        },
      )

      build.onResolve(
        { filter: BARE_IMPORT_RE },
        async (resolveInfo) => {
          const { path: id } = resolveInfo
          let external = false

          if (config.optimizeDeps.exclude)
            external = !!config.optimizeDeps.exclude.includes(id)

          // * 非 external 则需要依赖扫描，记录
          if (!external && !(await shouldExternal(config, resolveInfo.path))) {
            const root = config.root
            // * 只有 不存在这个 依赖，才需要解析，记录
            if (!deps[resolveInfo.path] && existsSync(path.resolve(root, 'node_modules'))) {
              const normalizedRoot = getPkgModulePath(resolveInfo.path, config.root)
              if (normalizedRoot) {
                // * 推入 deps 集合中
                deps[resolveInfo.path] = normalizedRoot
                flatIdToImports[flattenId(resolveInfo.path)] = normalizedRoot
              }
            }
          }
          // esbuild 读取到 jsx tsx 文件自动打包 react/jsx-runtime 需要添加到 react 依赖中
          if (resolveInfo.path === 'react/jsx-runtime') {
            const normalizedRoot = getPkgModulePath('react', config.root)
            if (normalizedRoot) {
              deps.react = normalizedRoot
              flatIdToImports.react = normalizedRoot
            }
          }
          return {
            path: id,
            external: true,
          }
        },
      )
    },
  }
}

async function shouldExternal(config: ResolvedConfig, path: string) {
  // * 如果是 虚拟模块: 'virtual:module' 则需要跳过
  if (path.startsWith('virtual'))
    return true

  // * 如果 用户配置了 alias 则需要进行匹配
  const alias = config.resolve?.alias
  if (alias) {
    const resolver = config.createResolver()
    const resolvedId = await resolver(path)

    // * 匹配不到 alias 则排除
    if (resolvedId !== path) {
      return {
        path,
        external: true,
      }
    }
    return false
  }
}
