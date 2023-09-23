import path from 'node:path'

import type { Loader, Plugin } from 'esbuild'
import { init, parse } from 'es-module-lexer'
import { promises } from 'fs-extra'

// 用来开发打印 debug 日志的库
import createDebug from 'debug'

import { BARE_IMPORT_RE } from '../constants'
import type { ResolvedConfig } from '../config'

const debug = createDebug('dev')

export function preBundlePlugin(
  deps: Record<string, string>,
  flatIdToImports: Record<string, string>,
  config: ResolvedConfig,
): Plugin {
  return {
    name: 'esbuild:pre-bundle',
    setup(build) {
      build.onResolve(
        { filter: BARE_IMPORT_RE },
        (resolveInfo) => {
          // 拿到 模块路径，以及父模块路径
          const { path: id, importer } = resolveInfo
          const isEntry = !importer

          // 命中 需要预编译的 依赖
          if (flatIdToImports[id]) {
            // 若为入口，则标记 dep 的 namespace
            return isEntry
              ? {
                  path: id,
                  namespace: 'dep',
                }
              : {
                  // * 因为走到 onResolve 了，所以 id 是 bare import 的路径（相对路径），
                  // * 这里的 path 是要绝对路径
                  // * 所以要 resolve 一下，拿到绝对路径
                  path: flatIdToImports[id],
                }
          }
        },
      )
      // 拿到标记后的依赖，构造代理模块，交给 esbuild 打包
      build.onLoad(
        {
          filter: /.*/,
          namespace: 'dep',
        },
        async (loadInfo) => {
          await init
          const id = loadInfo.path
          const root = config.root
          const entryPath = flatIdToImports[id]
          const code = await promises.readFile(entryPath, 'utf-8')

          const [_imports, _exports] = await parse(code)

          const proxyModule: string[] = []

          // cjs 格式
          if (!_imports.length && !_exports.length) {
            // 构造代理模块
            // 通过 require 拿到模块的导出对象
            // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
            const res = require(entryPath)
            // 用 Object.keys 拿到所有的具名导出
            const specifiers = Object.keys(res)

            // 构造 export 语句交给 Esbuild 打包
            proxyModule.push(
                            `export { ${specifiers.join(',')} } from '${entryPath}'`,
                            `export default require('${entryPath}')`,
            )
          }
          else {
            // esm 格式
            // 比较好处理
            // export * 或者 export default 即可
            if (_exports.includes('default')) {
              proxyModule.push(
                                `import d from "${entryPath}";export default d`,
              )
            }
            proxyModule.push(`export * from '${entryPath}'`)
          }
          debug('代理模块内容： %o', proxyModule.join('\n'))

          const loader = path.extname(entryPath).slice(1)

          return {
            loader: loader as Loader,
            contents: proxyModule.join('\n'),
            resolveDir: root,
          }
        },
      )
    },
  }
}
