import type { LoadResult, PartialResolvedId, SourceDescription } from 'rollup'
import type { ServerContext } from './server'
import type { ConfigEnv, ResolvedConfig, UserConfig } from './config'

export type PluginOption = Plugin
| false
| null
| undefined
| PluginOption[]
| Promise<Plugin | false | null | undefined | PluginOption[]>

export type ServerHook = (
  server: ServerContext
) => (() => void) | void | Promise<(() => void) | void>

// 只实现以下这几个钩子
export interface Plugin {
  name: string
  enforce?: 'pre' | 'post'

  apply?: 'serve' | 'build' | ((config: UserConfig, env: ConfigEnv) => boolean)

  config?: (
    config: UserConfig,
    env: ConfigEnv
  ) => UserConfig | null | void | Promise<UserConfig | null | void>

  configResolved?: (config: ResolvedConfig) => void | Promise<void>
  configureServer?: ServerHook
  resolveId?: (
    id: string,
    importer?: string
  ) => Promise<PartialResolvedId | null> | PartialResolvedId | null
  load?: (id: string) => Promise<LoadResult | null> | LoadResult | null
  transform?: (
    code: string,
    id: string
  ) => Promise<SourceDescription | null> | SourceDescription | null
  transformIndexHtml?: (raw: string) => Promise<string> | string
}
