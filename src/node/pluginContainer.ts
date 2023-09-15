import path from 'node:path'
import {
  type FunctionPluginHooks,
  type InputOptions,
  type LoadResult,
  type NormalizedInputOptions,
  type PartialResolvedId,
  type PluginContext,
  type ResolvedId,
  type RollupError,
  type SourceDescription,
  type TransformResult,
  VERSION,
} from 'rollup'
import { Parser } from 'acorn'
import type { Plugin } from './plugin'
import type { ResolvedConfig } from './config'

export const parser = Parser

export declare interface PluginContainer {
  options: InputOptions
  buildStart(options: InputOptions): Promise<void>
  resolveId(
    id: string,
    importer?: string,
    options?: {
      isEntry?: boolean
      skip?: Set<Plugin>
    }
  ): Promise<PartialResolvedId | null>
  transform(
    code: string,
    id: string,
    options?: {
      inMap?: SourceDescription['map']
      ssr?: boolean
    }
  ): Promise<SourceDescription | null>
  load(
    id: string,
    options?: {
      ssr?: boolean
    }
  ): Promise<LoadResult | null>
  close(): Promise<void>
}

// 模拟 Rollup 的插件机制
export async function createPluginContainer(config: ResolvedConfig): Promise<PluginContainer> {
  const { plugins } = config
  // 插件上下文
  class Context {
    _activePlugin: Plugin | null
    _resolveSkips: Set<Plugin> | null
    constructor(initialPlugin?: Plugin) {
      this._activePlugin = initialPlugin || null
      this._resolveSkips = null
    }

    async resolve(id: string, importer?: string, options: {
      isEntry?: boolean
      skipSelf?: boolean
    } = {}) {
      let skip: Set<Plugin> = new Set()
      if (options?.skipSelf && this._activePlugin) {
        // 保存上一次 已经跳过的插件
        skip = new Set(this._resolveSkips)

        // 新增 这一次需要跳过的 插件
        skip.add(this._activePlugin)
      }

      // * 删除这个属性 不需要传递到中resolveId
      delete options?.skipSelf

      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      let out = await pluginContainer.resolveId(id, importer)
      if (typeof out === 'string') {
        out = {
          id: out,
        }
      }
      return out as ResolvedId | null
    }

    parse(code: string, opts: any = {}) {
      return parser.parse(code, {
        sourceType: 'module',
        ecmaVersion: 'latest',
        locations: true,
        ...opts,
      })
    }

    error(
      err: RollupError | string,
      pos?: number | { column: number; line: number },
    ) {
      throw new Error(err.toString())
    }
  }
  const rollupPkgPath = path.resolve(
    config.root,
    'node_modules/rollup',
    'package.json',
  )
  const minimalContext = {
    meta: {
      rollupVersion: VERSION,
      watchMode: true,
    },
  }
  const rollupOptions = config.build?.rollupOptions || {}
  let closed = false
  const pluginContainer: PluginContainer = {
    options: await (async function () {
      for (const plugin of plugins as Plugin[]) {
        if (!plugin.options)
          continue
        const AfterRollupOptions = await (
          plugin.options && (plugin.options as FunctionPluginHooks['options'])
        ).call(minimalContext, rollupOptions)
        return AfterRollupOptions || {}
      }
      return rollupOptions
    }()),
    async resolveId(id, importer, options) {
      const ctx = new Context()
      const resolvedIdResult: PartialResolvedId = { id }
      for (const plugin of plugins as Plugin[]) {
        ctx._activePlugin = plugin
        if (options?.skip && options.skip.has(plugin))
          continue

        if (plugin.resolveId) {
          // * 调用插件的 resoledId 方法
          const result = await plugin.resolveId.call(
            ctx as unknown as PluginContext,
            id,
            importer, {
              isEntry: !!options?.isEntry,
            })
          if (!result)
            continue
          if (typeof result === 'string')
            // * 如果是 字符串，则赋值到 id 上
            resolvedIdResult.id = result
          return Object.assign(resolvedIdResult, result)
        }
      }
      return resolvedIdResult
    },
    // * 预构建前 开始调用
    async buildStart() {
      await Promise.all(
        (plugins as Plugin[]).map((p) => {
          if (p.buildStart) {
            return (p.buildStart as FunctionPluginHooks['buildStart'])
              .call(
                new Context(p) as unknown as PluginContext,
                pluginContainer.options as NormalizedInputOptions,
              )
          }
          return undefined
        }).filter(Boolean),
      )
    },
    async load(id) {
      const ctx = new Context()
      for (const plugin of plugins as Plugin[]) {
        if (plugin.load) {
          const result = await plugin.load.call(ctx as unknown as PluginContext, id)
          // * 因为 result 的结果 可以是 空字符串，0 等 falsy，所以需要 直接判断 null 或者 undefined
          if (result !== null && result !== undefined)
            return result
        }
      }
      return null
    },
    async transform(code, id, options) {
      const ctx = new Context()
      let source = code

      for (const plugin of plugins as Plugin[]) {
        let result: TransformResult | string | undefined
        try {
          if (plugin.transform)
            result = await plugin.transform.call(ctx as unknown as PluginContext, source, id)
        }
        catch (err) {
          ctx.error(err as RollupError | string)
        }
        if (!result)
          continue
        if (typeof result === 'string')
          source = result
        else if (result.code)
          source = result.code
        else
          source = ''
      }
      return {
        code: source,
      }
    },
    async close() {
      if (closed)
        return
      const ctx = new Context() as unknown as PluginContext
      await Promise.all(
        (plugins as Plugin[]).map((p) => {
          if (p.buildEnd)
            (p.buildEnd as FunctionPluginHooks['buildEnd']).call(ctx)
          return undefined
        }).filter(Boolean),
      )
      await Promise.all(
        (plugins as Plugin[]).map((p) => {
          if (p.closeBundle)
            (p.closeBundle as FunctionPluginHooks['closeBundle']).call(ctx)
          return undefined
        }).filter(Boolean),
      )
      closed = true
    },
  }

  return pluginContainer
}
