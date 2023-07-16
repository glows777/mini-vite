import { NextHandleFunction } from 'connect'

import { isJSRequest, cleanUrl} from '../../utils'
import { ServerContext } from '../index'
import createDebug from 'debug'

const debug = createDebug('dev')

export async function transformRequest(url: string, serverContext: ServerContext) {
    const { pluginContainer } = serverContext

    url = cleanUrl(url)

    // * 依次调用 插件容器的 resolvedId, load, transform 方法
    const resolvedResult = await pluginContainer.resolveId(url)
    let transformResult
    if (resolvedResult?.id) {
        let code = await pluginContainer.load(resolvedResult.id)
        if (typeof code === 'object' && code !== null) {
            code = code.code
        }
        if (code) {
            transformResult = await pluginContainer.transform(
                code as string,
                resolvedResult.id
            )
        }
    }
    return transformResult
} 

export function transformMiddleware (serverContext: ServerContext): NextHandleFunction {
    return async (req, res, next) => {
        if (req.method !== 'GET' || !req.url) {
            return next()
        }

        const url = req.url
        debug('transformMiddleware: %o', url)

        // transform JS request
        if (isJSRequest(url)) {
            // 编译函数
            let result: any = await transformRequest(url, serverContext)
            if (!result) {
                return next()
            }
            if (result && typeof result !== 'string') {
                result = result.code
            }

            // 编译完成，返回给浏览器
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/javascript')

            return res.end(result)
        }
        next()
    }
}
