import resolve from 'resolve'
import path from 'path'

import { pathExists } from 'fs-extra'

import { Plugin } from '../plugin'
import { ServerContext } from '../server'
import { DEFAULT_EXTERSIONS } from '../constants'
import { cleanUrl, normalizePath } from '../utils'

export function resolvePlugin(): Plugin {
    let serverContext: ServerContext
    return {
        name: 'm-vite:resolve',
        configureServer(s) {
            // 保存 服务端上下文
            serverContext = s
        },
        async resolveId(id: string, importer?: string) {
            // 绝对路径
            if (path.isAbsolute(id)) {
                if (await pathExists(id)) {
                    return { id }
                }
                // 加上 root 路径前缀， 处理 /src/main.tsx 的情况
                id = path.join(serverContext.root, id)
                if (await pathExists(id)) {
                    return { id }
                }
            } else if (id.startsWith('.')) { // 相对路径
                if (!importer) {
                    throw new Error('`importer` should not be undefined')
                }
                const hasExtension = path.extname(id).length > 1
                let reslovedId: string

                // 包含 文件名后缀,如 ./App.tsx
                if (hasExtension) {
                    reslovedId = normalizePath(resolve.sync(id, { basedir: path.dirname(importer) }))
                    if (await pathExists(reslovedId)) {
                        return { id: reslovedId }
                    }
                } else { // 不包含 文件名后缀   ./App -> ./App.tsx
                    for(const extname of DEFAULT_EXTERSIONS) {
                        try {
                            const withExtension = `${id}${extname}`
                            reslovedId = normalizePath(resolve.sync(withExtension, {
                                basedir: path.dirname(importer)
                            }))
                            if (await pathExists(reslovedId)) {
                                return { id: reslovedId }
                            }
                        } catch (e) {
                            continue
                        }
                    }
                }        
            }
            return null
        }
    }
}
