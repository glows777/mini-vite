import path from 'node:path'

import { build } from 'esbuild'
import { green } from 'picocolors'
import { PRE_BUNDLE_DIR } from '../constants'
import type { ResolvedConfig } from '../config'
import { scanPlugin } from './scanPlugin'
import { preBundlePlugin } from './preBundlePlugin'

export async function optimize(root: string, config: ResolvedConfig) {
  // 1. 确定入口
  // * 为方便开发，这里直接约定为 src 目录下的 main.tsx 文件
  const entry = path.resolve(root, 'src/main.tsx')

  // 存放 收集的 依赖信息
  const deps = new Set<string>()

  // 2. 从入口处扫描依赖，收集依赖信息
  await build({
    entryPoints: [entry],
    bundle: true,
    // * 这里是关键 write 为 false，表示不写入磁盘
    // * 这也是 为什么 同样是 调用 esbuild 的 bundle
    // * 扫描依赖会比打包快
    write: false,
    plugins: [scanPlugin(deps)],
  })
  console.log(
        `${green('需要预构建的依赖')}: \n${[...deps]
            .map(green)
            .map(item => `  ${item}`)
            .join('\n')
        }`,
  )

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
