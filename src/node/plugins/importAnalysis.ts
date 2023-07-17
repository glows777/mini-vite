import path from 'path'
import resolve from 'resolve'

import { init, parse } from 'es-module-lexer'
import { pathExists } from 'fs-extra'

// magic-string 用于字符串编辑
import MagicString from 'magic-string'

import {
    BARE_IMPORT_RE,
    DEFAULT_EXTERSIONS,
    PRE_BUNDLE_DIR
} from '../constants'
import { cleanUrl, isJSRequest, normalizePath, getShortName } from '../utils'
import { Plugin } from '../plugin'
import { ServerContext } from '../server'

export function importAnalysisPlugin(): Plugin {
    let serverContext: ServerContext
    
    return {
        name: 'm-vite:import-analysis',
        configureServer(s) {
            serverContext = s
        },

        async transform(code, id) {
            const resolve = async (id: string, importer?: string) => {
                const resolved = await serverContext.pluginContainer.resolveId(
                  id,
                  normalizePath(importer!)
                )
                if (!resolved) {
                  return
                }
                let resolvedId = `/${getShortName(resolved.id, serverContext.root)}`;
                return resolvedId
              }


            // 只处理 JS 相关请求
            if (!isJSRequest(id)) {
                return null
            }

            await init
            // 解析 import 语句
            const [imports] = parse(code)
            const ms = new MagicString(code)

            // 对于 每一个 import 语句依次进行分析
            for (const importInfo of imports) {
                // 举例说明: const str = `import React from 'react'`
                // str.slice(s, e) => 'react'
                const { s: modStart, e: modEnd, n: modSource } = importInfo
                if (!modSource) {
                    continue
                }
                if (modSource.endsWith('.svg')) {
                    // * 加上 ?import 后缀，方便后续识别
                    const resolvedUrl = path.join(path.dirname(id), modSource)
                    ms.overwrite(modStart, modEnd, `${resolvedUrl}?import`)
                    continue
                }

                // 第三方库 路径重写到预构建 产物的路径
                if (BARE_IMPORT_RE.test(modSource)) {
                    const bundlePath = normalizePath(
                        path.join('/', PRE_BUNDLE_DIR, `${modSource}.js`)
                    )
                    ms.overwrite(modStart, modEnd, bundlePath)
                } else if (modSource.startsWith('.') || modSource.startsWith('/')) {
                    // 接调用插件上下文的 resolve 方法，会自动经过路径解析插件的处理
                    const resolved = await resolve(modSource, id)
                    if (resolved) {
                        ms.overwrite(modStart, modEnd, resolved)
                    }
                }
            }

            return {
                code: ms.toString(),
                // 生成 SourceMap
                map: ms.generateMap()
            }
        }
    }
}


