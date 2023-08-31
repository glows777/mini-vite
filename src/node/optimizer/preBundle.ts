import path from 'node:path'
import type { Metafile } from 'esbuild'
import { build } from 'esbuild'
import { promises } from 'fs-extra'
import { green } from 'picocolors'
import type { ResolvedConfig } from '../config'
import { error, flattenId, getDepHash, normalizePath } from '../utils'
import type { DepOptimizationMetadata } from './loadCached'
import { preBundlePlugin } from './preBundlePlugin'

export async function preBundle(
  deps: Record<string, string>,
  flatIdToImports: Record<string, string>,
  config: ResolvedConfig,
) {
  // * 获取 缓存的目录，以及用户的 自定义 esbuild 配置
  const { cacheDir, optimizeDeps: { esbuildOptions } } = config
  const entries = Object.keys(flatIdToImports)

  try {
    const { metafile } = await build({
      // * 这里 入口是 flatten 过的 id -> react react_jsx-runtime
      entryPoints: [...entries],
      write: true,
      bundle: true,
      format: 'esm',
      splitting: true,
      outdir: cacheDir,
      plugins: [preBundlePlugin(deps, flatIdToImports, config)],
      // * 生成 metafile 信息
      metafile: true,
      ...esbuildOptions,
    })
    // * 写入 磁盘
    await writeMetaFile(config, metafile, deps)
  }
  catch (err) {
    error(`preBundleError: 预构建错误 ${err}`)
  }

  if (entries.length > 0)
    console.log(green('🎆 > 预构建完成~'))
  else
    console.log(green('🤐 > 没有扫描到需要预构建的依赖，不进行预构建'))
}

async function writeMetaFile(
  config: ResolvedConfig,
  metafile: Metafile,
  deps: Record<string, string>,
) {
  const mainHash = getDepHash(config)
  const dataPath = path.resolve(config.cacheDir, '_metadata.json')
  const data: DepOptimizationMetadata = {
    hash: mainHash,
    // browserHash: getBrowserHash(mainHash, deps),
    browserHash: mainHash,
    optimized: {},
    depInfoList: [],
  }
  for (const id in deps) {
    const entry = deps[id]
    data.optimized[id] = {
      id,
      file: normalizePath(path.resolve(config.cacheDir, `${flattenId(id)}.js`)),
      src: entry,
    }
  }
  await promises.writeFile(dataPath, JSON.stringify(data, null, 2))
}
