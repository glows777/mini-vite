import path from 'node:path'
import type { NextHandleFunction } from 'connect'

import createDebug from 'debug'
import { existsSync, pathExists } from 'fs-extra'
import type { SourceDescription } from 'rollup'
import { cleanUrl, error, getTimeStampFromUrl, isClient, isCssRequest, isImportRequest, isJSRequest, isObject, isVirtual, osPath } from '../../utils'
import type { ServerContext } from '../index'

const debug = createDebug('dev')

export async function transformRequest(
  url: string,
  serverContext: ServerContext,
  timeStamp: string | null,
) {
  const { moduleGraph, root } = serverContext

  // todo 过滤出 t等参数
  url = decodeURIComponent(cleanUrl(url))
  let id = url

  if (
    !existsSync(id)
    && !isVirtual(id)
    && !isClient(id)
  ) {
    id = osPath(path.join(root, id))
    await moduleGraph.ensureEntryFromUrl(url)
    if (!await pathExists(id))
      error(`pathError: 请检查导入语句的路径是否正确 根目录中无法找到 '${url}' 文件`)
  }

  const transformResult = await doTransform(id, url, serverContext, timeStamp ? Number.parseInt(timeStamp) : undefined)
  return transformResult
}

export async function doTransform(
  id: string,
  url: string,
  serverContext: ServerContext,
  timeStamp?: number,
) {
  const { pluginContainer, moduleGraph } = serverContext
  const mod = moduleGraph.getModuleById(id)
  // * 命中缓存
  if (mod && mod.transformResult) {
    // * 小于表示当前的 hmr 请求是最新的 需要最新的 transform 结果
    if (timeStamp && mod.lastHMRTimestamp < timeStamp)
      mod.lastHMRTimestamp = timeStamp
    else
    // * 不携带 t 参数的请求
      return mod.transformResult
  }

  // * 这里的 resolveId 的执行由插件 importAnalysis 内部执行
  // * importAnalysis 插件会处理为能直接读取文件的路径
  // * 因为 alias 属性如 @/src/index.js 会被当做 bare imports 打包
  // * 为了避免这种情况 只能在 importAnalysis 插件中判断是否命中 alias 属性
  // * 然后调用每一个插件的 resolveId

  const loadResult = await pluginContainer.load(id)
  let code: string | null | void = ''
  if (isObject(loadResult))
    code = loadResult.code
  else
    code = loadResult

  let transformResult: SourceDescription | null = null
  if (code)
    transformResult = (await pluginContainer.transform(code, id)) || { code }
  // * 添加 缓存
  if (transformResult && mod)
    mod.transformResult = transformResult

  return transformResult!
}

export function transformMiddleware(serverContext: ServerContext): NextHandleFunction {
  return async (req, res, next) => {
    if (req.method !== 'GET' || !req.url)
      return next()

    const { url } = req
    const timeStamp = getTimeStampFromUrl(url)

    debug('transformMiddleware: %o', url)

    // transform JS request
    if (isJSRequest(url) || isCssRequest(url) || isImportRequest(url)) {
      if (url.includes('node_modules/.m-vite')) {
        const maxAge = 60 * 60 * 24
        res.setHeader('Cache-Control', `max-age=${maxAge},immutable`)
      }
      try {
      // 编译函数
        let result: any = await transformRequest(url, serverContext, timeStamp)
        if (!result)
          return next()

        if (result && typeof result !== 'string')
          result = result.code

        // 编译完成，返回给浏览器
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/javascript')
        return res.end(result)
      }
      catch (err) {
        error(`devServerError: 中间件 [transformMiddleware] 错误, ${err}`)
      }
    }
    next()
  }
}
