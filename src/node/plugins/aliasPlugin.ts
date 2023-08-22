import type { Alias, ResolvedConfig } from '../config'
import type { Plugin } from '../plugin'
import type { ServerContext } from '../server'
import { matches, normalizePath } from '../utils'

export function aliasPlugin(config: ResolvedConfig): Plugin {
  let serverContext: ServerContext
  return {
    name: 'm-vite-alias',
    configureServer(s) {
      serverContext = s
    },
    async resolveId(id, importer, opts) {
      const alias = config.resolve?.alias

      if (!alias)
        return undefined

      const matchEntries = (alias as Alias[]).find(({ find }) => {
        return matches(find, id)
      })

      if (!matchEntries)
        return null

      const updateId = id.replace(matchEntries.find, matchEntries.replacement)

      // * 因为 这里的 id 必须要有返回值，但是仍然要交由后续的插件处理（只是 alias 转换）
      // * 调用 ctx 的 resolve 方法，同时跳过 当前这个插件的 处理
      return await this.resolve(normalizePath(updateId), importer, {
        skipSelf: true,
        ...opts,
      })
    },
  }
}
