import { build } from 'esbuild'
import { green } from 'picocolors'
import type { ResolvedConfig } from '../config'
import { error, flattenId, getPkgModulePath } from '../utils'
import { scanPlugin } from './scanPlugin'

export async function scanDeps(
  config: ResolvedConfig,
  entryPoints: string[],
) {
  const depStr = ''

  if (!config.optimizeDeps.exclude)
    config.optimizeDeps.exclude = []

  const deps: Record<string, string> = {}
  const flatIdToImports: Record<string, string> = {}

  const { plugins = [], ...esbuildOptions } = config.optimizeDeps.esbuildOptions ?? {}

  try {
    await build({
      entryPoints,
      bundle: true,
      // * 这里是关键 write 为 false，表示不写入磁盘
      // * 这也是 为什么 同样是 调用 esbuild 的 bundle
      // * 扫描依赖会比打包快
      write: false,
      plugins: [...plugins, scanPlugin(deps, flatIdToImports, config)],
      // * exclude 不需要的进行预构建的依赖
      external: [...config.optimizeDeps.exclude],
      ...esbuildOptions,
    })
  }
  catch (err) {
    error(`scanDepsError: 扫描依赖出错 ${err}`)
  }

  // 将 include 参数 添加到 deps 中
  const include = config.optimizeDeps.include || []
  for (const moduleName of include) {
    const normalizedRoot = getPkgModulePath(moduleName, config.root)
    if (normalizedRoot) {
      deps[moduleName] = normalizedRoot
      flatIdToImports[flattenId(moduleName)] = normalizedRoot
    }
  }

  console.log(
    `${green('需要预构建的依赖')}: \n${Object.values(deps)
        .map(green)
        .map(item => `  ${item}`)
        .join('\n')
    }`,
  )

  return [deps, flatIdToImports]
}
