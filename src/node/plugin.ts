import type { CustomPluginOptions, LoadResult, PluginContext, ResolveIdResult, SourceDescription } from 'rollup'
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

export type TransformResult =
  | string
  | null
  | void
  | Partial<SourceDescription>
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
    this: PluginContext,
    id: string,
    importer?: string,
    options?: {
      custom?: CustomPluginOptions
      ssr?: boolean
      // * Excluded from this release type: scan
      isEntry: boolean
    }
  ) => Promise<ResolveIdResult> | LoadResult
  load?: (
    this: PluginContext,
    id: string,
    options?: {
      ssr?: boolean
    }
  ) => Promise<LoadResult | null> | LoadResult | null
  transform?: (
    this: PluginContext,
    code: string,
    id: string,
    options?: {
      ssr?: boolean
    }
  ) => Promise<TransformResult> | TransformResult
  transformIndexHtml?: (raw: string) => Promise<string> | string
}
