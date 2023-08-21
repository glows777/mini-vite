import type { NextHandleFunction } from 'connect'

import createDebug from 'debug'
import { cleanUrl, isCssRequest, isImportRequest, isJSRequest } from '../../utils'
import type { ServerContext } from '../index'

const debug = createDebug('dev')

export async function transformRequest(url: string, serverContext: ServerContext) {
  const { pluginContainer, moduleGraph } = serverContext

  url = cleanUrl(url)

  let mod = await moduleGraph.getModuleByUrl(url)
  // 命中缓存，直接返回，不需要再 去经过一系列处理
  if (mod && mod.transformResult)
    return mod.transformResult

  // * 依次调用 插件容器的 resolvedId, load, transform 方法
  const resolvedResult = await pluginContainer.resolveId(url)
  let transformResult
  if (resolvedResult?.id) {
    let code = await pluginContainer.load(resolvedResult.id)
    if (typeof code === 'object' && code !== null)
      code = code.code

    // 加载 load 后，需要注册模块
    mod = await moduleGraph.ensureEntryFromUrl(url)
    if (code) {
      transformResult = await pluginContainer.transform(
        code as string,
        resolvedResult.id,
      )
    }
  }
  // 添加缓存
  if (mod)
    mod.transformResult = transformResult

  return transformResult
}

export function transformMiddleware(serverContext: ServerContext): NextHandleFunction {
  return async (req, res, next) => {
    if (req.method !== 'GET' || !req.url)
      return next()

    const url = req.url
    debug('transformMiddleware: %o', url)

    // transform JS request
    if (isJSRequest(url) || isCssRequest(url) || isImportRequest(url)) {
      // 编译函数
      let result: any = await transformRequest(url, serverContext)
      if (!result)
        return next()

      if (result && typeof result !== 'string')
        result = result.code

      // 编译完成，返回给浏览器
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/javascript')

      return res.end(result)
    }
    next()
  }
}
