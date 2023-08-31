import path from 'node:path'

import type { ResolvedConfig } from '../config'
import { isArray, isObject } from '../utils'
import { loadCachedDepOptimizedMetadata } from './loadCached'
import { scanDeps } from './scanDeps'
import { preBundle } from './preBundle'

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

  const cachedMetaData = loadCachedDepOptimizedMetadata(config)

  if (!cachedMetaData) {
    // 2. 从入口处扫描依赖，收集依赖信息
    const [deps, flatIdToImports] = await scanDeps(config, entryPoints)

    await preBundle(deps, flatIdToImports, config)
    //   // 3. 预构建依赖
  }
}
