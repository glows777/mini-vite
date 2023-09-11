import path from 'node:path'
import resolve from 'resolve'

import { pathExists, pathExistsSync } from 'fs-extra'

import type { Plugin } from '../plugin'
import type { ServerContext } from '../server'
import { BARE_IMPORT_RE, DEFAULT_EXTERSIONS, PRE_BUNDLE_DIR } from '../constants'
import { error, flattenId, normalizePath, osPath } from '../utils'
import type { ResolvedConfig } from '../config'

export function resolvePlugin(resolvedConfig: ResolvedConfig): Plugin {
  let serverContext: ServerContext
  return {
    name: 'm-vite:resolve',
    configureServer(s) {
      // 保存 服务端上下文
      serverContext = s
    },
    async resolveId(id: string, importer?: string) {
      const basedir = importer
        ? path.dirname(importer)
        : serverContext
          ? serverContext.config.root
          : resolvedConfig.root
      const root = resolvedConfig.root
      const hasExtension = path.extname(id).length > 1
      // 绝对路径
      if (path.isAbsolute(id)) {
        if (await pathExists(id))
          return { id }
        // 加上 root 路径前缀， 处理 /src/main.tsx 的情况
        if (hasExtension) {
          id = osPath(normalizePath(path.join(basedir, id)))
          if (await pathExists(id))
            return { id }
        }
        else {
          for (const ext of DEFAULT_EXTERSIONS) {
            try {
              const withExtResolved = path.join(basedir, id + ext)
              if (pathExistsSync(withExtResolved))
                return { id: withExtResolved }
            }
            catch (err) {
              continue
            }
          }
        }
        error(
          `pluginError: 插件 [resolvePlugin] 没有在 '${root}' 找到 '${id}' 文件`,
        )
      }
      // 相对路径
      else if (id.startsWith('.')) {
        if (!importer) {
          error('pluginError: 插件 [resolvePlugin] 的 resolveId 方法必须传入 importer 参数')
          throw new Error('`importer` should not be undefined')
        }

        let resolvedId: string = id

        // 包含 文件名后缀,如 ./App.tsx
        if (hasExtension) {
          resolvedId = path.resolve(basedir, id)
          if (await pathExists(resolvedId))
            return { id: resolvedId }
        }
        else { // 不包含 文件名后缀   ./App -> ./App.tsx
          for (const extname of DEFAULT_EXTERSIONS) {
            try {
              const withExtension = `${id}${extname}`
              resolvedId = normalizePath(resolve.sync(withExtension, {
                basedir: path.dirname(importer),
              }))
              if (pathExistsSync(resolvedId))
                return { id: resolvedId }
            }
            catch (e) {
              continue
            }
          }
          error(
            `pluginError: 插件 [resolvePlugin] 没有在 '${root}' 找到 '${resolvedId}' 文件`,
          )
        }
      }
      // 第三方依赖
      else if (BARE_IMPORT_RE.test(id)) {
        const preBundlePath = path.resolve(
          root,
          PRE_BUNDLE_DIR,
          `${flattenId(id)}.js`,
        )
        if (await pathExists(preBundlePath))
          return { id: preBundlePath }
      }
      return null
    },
  }
}
