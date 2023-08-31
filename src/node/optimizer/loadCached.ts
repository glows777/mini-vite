import path from 'node:path'
import { emptyDir, readFileSync } from 'fs-extra'
import { green } from 'picocolors'
import type { ResolvedConfig } from '../config'
import { getDepHash, normalizePath } from '../utils'

export declare interface DepOptimizationMetadata {
  hash: string
  browserHash: string
  optimized: Record<string, OptimizedDepInfo>
  depInfoList: OptimizedDepInfo[]
}

export declare interface OptimizedDepInfo {
  id: string
  file: string
  src?: string
  needsInterop?: boolean
  browserHash?: string
  fileHash?: string
  processing?: Promise<void>
}

export function loadCachedDepOptimizedMetadata(config: ResolvedConfig) {
  // * 用户配置 是否开启 强制预构建
  const force = config.optimizeDeps.force

  // * 获取 _metadata.json 位置
  const cacheMetadataPath = path.resolve(config.cacheDir, '_metadata.json')

  // * 进行预构建前 需要判断是否 需要预构建， force 为 true 则开启
  // * 通过 metadata 进行比较
  if (!force) {
    let cachedMetaData
    try {
      // * 读取上一次预构建的 _metadata.json 元信息并解析
      cachedMetaData = parseDepsOptimizeMetadata(
        readFileSync(cacheMetadataPath, 'utf-8'),
        cacheMetadataPath,
      )
    }
    catch (error) {
    }
    // * 计算当前配置元信息的 hash 并与上一次的配置元信息进行对比，相同则不会触发预构建
    // * 哈希与 package-lock.json 或 yarn.lock 或 pnpm-lock.yaml，config 有关
    // * 也就是说，他们发生变化，会再次触发预构建
    if (cachedMetaData && cachedMetaData.hash === getDepHash(config)) {
      console.log(green('😎 > Hash 与之前预构建的 Hash 相同，不需要再次预构建'))
      console.log(green('😶‍🌫️ > 强制预构建请使用 --force 或者 在配置文件中声明'))
      return cachedMetaData
    }
    // * 需要 预构建，则清空 cacheDir
    emptyDir(config.cacheDir)
  }
  else {
    // * 需要 预构建，则清空 cacheDir
    emptyDir(config.cacheDir)
  }
}

export function parseDepsOptimizeMetadata(
  jsonMetadata: string,
  cacheDir: string,
) {
  const { hash, browserHash, optimized } = JSON.parse(
    jsonMetadata,
    (k, v) => {
      if (k === 'file' || k === 'src')
        return normalizePath(path.resolve(cacheDir, v))

      return v
    },
  )

  const metadata = {
    hash,
    browserHash,
    optimized: {},
    depInfoList: [],
  }

  for (const id of Object.keys(optimized)) {
    addOptimizedDepInfo(metadata, 'optimized', {
      ...optimized[id],
      id,
      browserHash,
    })
  }

  return metadata
}

function addOptimizedDepInfo(
  metadata: DepOptimizationMetadata,
  type: 'hash' | 'browserHash' | 'optimized',
  depInfo: OptimizedDepInfo,
) {
  if (typeof metadata[type] !== 'string')
    (metadata[type] as Record<string, OptimizedDepInfo>)[depInfo.id] = depInfo

  metadata.depInfoList.push(depInfo)
  return depInfo
}
