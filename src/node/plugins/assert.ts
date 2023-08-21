import type { Plugin } from '../plugin'
import type { ServerContext } from '../server'
import { cleanUrl, getShortName, normalizePath, removeImportQuery } from '../utils'

export function assertPlugin(): Plugin {
  let serverContext: ServerContext
  return {
    name: 'm-vite:assertPlugin',
    configureServer(s) {
      serverContext = s
    },
    async load(id) {
      const cleanedId = removeImportQuery(cleanUrl(id))
      const resolvedId = `/${getShortName(normalizePath(id), serverContext.root)}`

      if (cleanedId.endsWith('.svg')) {
        return {
          code: `export default '${resolvedId}'`,
        }
      }
    },
  }
}
