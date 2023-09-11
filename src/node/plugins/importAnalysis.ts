import path from 'node:path'

import { init, parse } from 'es-module-lexer'

// magic-string 用于字符串编辑
import MagicString from 'magic-string'

import {
  CLIENT_PUBLIC_PATH,
} from '../constants'
import type { AcceptedUrl } from '../utils'
import { cleanUrl, getRelativeRootPath, getShortName, isCssRequest, isInternalRequest, isJSRequest, lexAcceptedHmrDeps, normalizePath, osPath } from '../utils'
import type { Plugin } from '../plugin'
import type { ServerContext } from '../server'
import { handlePrunedModules } from '../hmr'

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
      const { moduleGraph, config } = serverContext
      // 拿到 当前模块
      const curMod = moduleGraph.getModuleById(normalizePath(id))!
      // 初始化 该模块所依赖的模块 Set
      const importedModules = new Set<string>()
      const acceptedUrls = new Set<AcceptedUrl>()
      const normalizedAcceptedUrls = new Set<string>()
      let isSelfAccepting = false
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
        const { s: modStart, e: modEnd, n: modSource, ss, se } = importInfo

        if (modSource) {
          // * 如果是虚拟模块 就不走resolved 转化为/virtual
          if (modSource.startsWith('virtual')) {
            ms.overwrite(
              modStart,
              modEnd,
              normalizePath(`/${modSource}`),
            )
            importedModules.add(`/${modSource}`)
            continue
          }
          if (modSource.endsWith('.svg')) {
          // * 加上 ?import 后缀，方便后续识别
            const resolvedUrl = path.join(path.dirname(id), modSource)
            ms.overwrite(modStart, modEnd, `${resolvedUrl}?import`)
            continue
          }

          // * 如果子模块引入了 a 文件 删除保存 再一次引入 a 文件 对于热更新来说
          // * 需要向 a 文件的末尾添加 ?t=timestamp 上次更新的时间戳
          // * 如果之前没有引入过 b 文件 也就是首次创建的 那么就不需要添加时间戳
          // * 所以这里需要通过 分析子路径 判断当前构建的文件是否已经在 moduleGraph 中
          // * 如果有 则属于 重新再引入 需要添加时间戳 否则就不需要添加
          // * 自动添加依赖到 moduleGraph 中

          // * 调用插件上下文的 resolve 方法, 获取路径，会自动经过路径解析插件的处理
          const resolved = await this.resolve(modSource, id)

          let normalizePathResolvedId = osPath(normalizePath(resolved!.id))
          const childMod = moduleGraph.getModuleById(normalizePathResolvedId)
          if (childMod && childMod.lastHMRTimestamp > 0)
            normalizePathResolvedId = `${normalizePathResolvedId}?t=${childMod.lastHMRTimestamp}`

          // * 获取相对于根目录的文件路径 'react' => '/node_modules/.m-vite/react.js'
          const importedModule = getRelativeRootPath(resolved!.id, config.root)
          // * 添加 依赖路径
          importedModules.add(importedModule)

          if (resolved)
            ms.overwrite(modStart, modEnd, normalizePathResolvedId)
        }
        // * 如果是 undefined 表示 import.meta.hot.accept()
        else if (modSource === undefined) {
          const rawUrl = code.slice(ss, se)
          if (rawUrl === 'import.meta') {
            const prop = code.slice(se, se + 4)
            if (prop === '.hot') {
              if (code.slice(modEnd + 4, modEnd + 11) === '.accept') {
                // * 分析 import.meta.hot.accept
                // * 如果有一个是接受自我更新 则 isSelfAccepting = true
                if (
                  lexAcceptedHmrDeps(code, code.indexOf('(', modEnd + 11) + 1, acceptedUrls)
                )
                  isSelfAccepting = true
              }
            }
          }
        }
      }
      // console.log(curMod.id, importedModules)
      const pruneImports = await moduleGraph.updateModuleInfo(
        curMod,
        importedModules,
        null,
        normalizedAcceptedUrls,
        null,
        isSelfAccepting,
      )
      if (pruneImports)
        handlePrunedModules(pruneImports, serverContext)

      // 只对 业务源码 注入
      if (!id.includes('node_modules')) {
        // * 获取相对于根目录的路径
        const currentModulePath = getRelativeRootPath(id, config.root)
        if (isCssRequest(id)) {
          ms.prepend(`
            import { updateStyle, removeStyle } from ${CLIENT_PUBLIC_PATH}
          `)
        }
        // 注入 HMR 相关工具函数
        ms.prepend(
                    `import { createHotContext as __m_vite_createHotContext } from '${CLIENT_PUBLIC_PATH}';
                    \r\nimport.meta.hot = __m_vite_createHotContext(${JSON.stringify(
                        currentModulePath,
                    )});\r\n`,
        )
      }
      return {
        code: ms.toString(),
        // 生成 SourceMap
        map: ms.generateMap(),
      }
    },
  }
}
