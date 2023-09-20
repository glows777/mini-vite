import path from 'node:path'
import type { NextHandleFunction } from 'connect'
import mime from 'mime'

import { promises } from 'fs-extra'
import { CLIENT_PUBLIC_PATH } from '../../constants'
import { cleanUrl, isImportRequest } from '../../utils'

export function staticMiddleware(root: string): NextHandleFunction {
  // const serveFromRoot = sirv(root, { dev: true })
  return async (req, res, next) => {
    if (!req.url)
      return

    if (isImportRequest(req.url) || req.url === CLIENT_PUBLIC_PATH)
      return

    let url = path.join(root, decodeURIComponent(cleanUrl(req.url)))
    // todo mac 环境下 会自动请求 favicon icon ，所以这里暂时硬编码一下
    if (url.includes('favicon.ico'))
      url = path.join(root, 'public/favicon.svg')

    const ext = path.extname(url)
    const contentType = mime.getType(ext)

    res.setHeader('Content-Type', contentType!)
    res.setHeader('Cache-Control', `max-age=${60 * 60 * 24},immutable`)
    const content = await promises.readFile(url)
    res.end(content)
    return next()
  }
}
