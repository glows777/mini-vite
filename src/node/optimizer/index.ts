import path from 'node:path'

import { build } from 'esbuild'
import { PRE_BUNDLE_DIR } from '../constants'
import type { ResolvedConfig } from '../config'
import { isArray, isObject } from '../utils'
import { preBundlePlugin } from './preBundlePlugin'
import { scanDeps } from './scanDeps'

export async function optimize(root: string, config: ResolvedConfig) {
  // 1. 确定入口
  // * 默认为 root 目录下的 index.html
  const entry = path.resolve(root, 'index.html')

  // optimizeDeps 配置中的 entries， esbuild 入口
  const {
    optimizeDeps: {
      entries,
    },
  } = config

  // rollup 配置中的 input 入口
  const { input } = config.build?.rollupOptions ?? {}

  const entryPoints = [entry]

  // 先看 optimizeDeps 配置 entries 是否存在， 存在则 覆盖 默认的 entry
  if (entries) {
    if (typeof entries === 'string') {
      entryPoints[0] = entries
    }
    else {
      entryPoints.pop()
      entryPoints.push(
        ...entries.map(entry => path.isAbsolute(entry) ? entry : path.resolve(root, entry)),
      )
    }
  }

  // 再看 input 是否存在 存在，则继续覆盖上面的 默认 || optimizeDeps 配置的 entries
  if (input) {
    if (typeof input === 'string')
      entryPoints[0] = input

    else if (isArray(input))
      input.forEach(p => entryPoints.push(path.resolve(root, p)))

    else if (isObject(input))
      Object.values(input).forEach(p => entryPoints.push(path.resolve(root, p)))
  }

  // 存放 收集的 依赖信息
  const deps = new Set<string>()
  const [deps2, flatIdToImports] = await scanDeps(config, entryPoints)
  console.log(deps2, flatIdToImports)

  // 2. 从入口处扫描依赖，收集依赖信息
  // await build({
  //   entryPoints: [entry],
  //   bundle: true,
  //   // * 这里是关键 write 为 false，表示不写入磁盘
  //   // * 这也是 为什么 同样是 调用 esbuild 的 bundle
  //   // * 扫描依赖会比打包快
  //   write: false,
  //   plugins: [scanPlugin(deps)],
  // })
  // console.log(
  //       `${green('需要预构建的依赖')}: \n${[...deps]
  //           .map(green)
  //           .map(item => `  ${item}`)
  //           .join('\n')
  //       }`,
  // )

  // 3. 预构建依赖
  await build({
    entryPoints: [...deps],
    write: true,
    bundle: true,
    format: 'esm',
    splitting: true,
    outdir: path.resolve(root, PRE_BUNDLE_DIR),
    plugins: [preBundlePlugin(deps)],
  })
}
