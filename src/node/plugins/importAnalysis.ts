import path from 'node:path'

import { init, parse } from 'es-module-lexer'

// magic-string 用于字符串编辑
import MagicString from 'magic-string'

import {
  BARE_IMPORT_RE,
  CLIENT_PUBLIC_PATH,
  PRE_BUNDLE_DIR,
} from '../constants'
import { cleanUrl, getShortName, isInternalRequest, isJSRequest, normalizePath } from '../utils'
import type { Plugin } from '../plugin'
import type { ServerContext } from '../server'

export function importAnalysisPlugin(): Plugin {
  let serverContext: ServerContext

  return {
    name: 'm-vite:import-analysis',
    configureServer(s) {
      serverContext = s
    },

    async transform(code, id) {
      // 只处理 JS 文件， 排除 client 注入的 JS
      if (!isJSRequest(id) || isInternalRequest(id))
        return null

      await init
      // 解析 import 语句
      const [imports] = parse(code)
      const ms = new MagicString(code)

      // 拿到 模块依赖图
      const { moduleGraph } = serverContext
      // 拿到 当前模块
      const curMod = moduleGraph.getModuleById(id)!
      // 初始化 该模块所依赖的模块 Set
      const importedModules = new Set<string>()
      const resolve = async (id: string, importer?: string) => {
        const resolved = await serverContext.pluginContainer.resolveId(
          id,
          normalizePath(importer!),
        )
        if (!resolved)
          return

        const cleanedId = cleanUrl(resolved.id)
        const mod = moduleGraph.getModuleById(cleanedId)
        let resolvedId = `/${getShortName(resolved.id, serverContext.root)}`
        if (mod && mod.lastHMRTimestamp > 0)
          resolvedId += `?t=${mod.lastHMRTimestamp}`

        return resolvedId
      }

      // 对于 每一个 import 语句依次进行分析
      for (const importInfo of imports) {
        // 举例说明: const str = `import React from 'react'`
        // str.slice(s, e) => 'react'
        const { s: modStart, e: modEnd, n: modSource } = importInfo
        if (!modSource)
          continue

        if (modSource.endsWith('.svg')) {
          // * 加上 ?import 后缀，方便后续识别
          const resolvedUrl = path.join(path.dirname(id), modSource)
          ms.overwrite(modStart, modEnd, `${resolvedUrl}?import`)
          continue
        }

        // 第三方库 路径重写到预构建 产物的路径
        if (BARE_IMPORT_RE.test(modSource)) {
          const bundlePath = normalizePath(
            path.join('/', PRE_BUNDLE_DIR, `${modSource}.js`),
          )
          ms.overwrite(modStart, modEnd, bundlePath)
          // 添加模块 到依赖模块 Set 中
          importedModules.add(bundlePath)
        }
        else if (modSource.startsWith('.') || modSource.startsWith('/')) {
          // 接调用插件上下文的 resolve 方法，会自动经过路径解析插件的处理
          const resolved = await resolve(modSource, id)
          if (resolved) {
            ms.overwrite(modStart, modEnd, resolved)
            // 添加模块 到依赖模块 Set 中
            importedModules.add(resolved)
          }
        }
      }

      // 只对 业务源码 注入
      if (!id.includes('node_modules')) {
        // 注入 HMR 相关工具函数
        ms.prepend(
                    `import { createHotContext as __vite_createHotContext } from '${CLIENT_PUBLIC_PATH}';`
                    + `import.meta.hot = __vite_createHotContext(${JSON.stringify(
                        cleanUrl(curMod.url),
                    )});`,
        )
      }

      // 更新 模块间的关系
      moduleGraph.updateModuleInfo(curMod, importedModules)
      return {
        code: ms.toString(),
        // 生成 SourceMap
        map: ms.generateMap(),
      }
    },
  }
}
