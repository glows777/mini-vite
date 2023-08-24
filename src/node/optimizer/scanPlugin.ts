import path from 'node:path'
import type { Plugin } from 'esbuild'

import { existsSync, promises } from 'fs-extra'
import { parse } from 'es-module-lexer'
import { BARE_IMPORT_RE, EXTERNAL_TYPES, HTMLTypesRE, SRCRE, ScriptModuleRE, ScriptRE, TYPERE } from '../constants'
import type { ResolvedConfig } from '../config'
import { error } from '../utils'

export function scanPlugin(
  // 依赖映射表 { 'react/jsx-runtime': '实际入口路径' }
  deps: Record<string, string>,
  // 扁平化依赖 映射表 { 'react_jsx-runtime': '实际入口路径' }
  flatIdToImports: Record<string, string>,
  config: ResolvedConfig,
): Plugin {
  return {
    name: ' esbuild:scan-deps',
    setup(build) {
      // * 处理 html vue 文件
      build.onResolve(
        { filter: HTMLTypesRE },
        (resolveInfo) => {
          return {
            path: resolveInfo.path,
            namespace: 'html',
          }
        },
      )
      build.onLoad(
        { filter: HTMLTypesRE, namespace: 'html' },
        async (resolveInfo) => {
          let htmlPath = ''

          if (existsSync(resolveInfo.path))
            htmlPath = resolveInfo.path
          else
            htmlPath = path.resolve(config.root, resolveInfo.path)

          // * 如果 resolve 后，仍然找不到 该路径，则直接报错
          if (existsSync(htmlPath))
            error(`pluginError: 插件 [scanPlugin] 找不到'${htmlPath}', 根目录为 ${config.root}`)

          let contents = ''

          const htmlContent = await promises.readFile(htmlPath, 'utf-8')

          // * 解析 html 文件，读取 <script type="module" src="xxxx"></script> 中 src 指向的 xxx 的文件内容
          // * 兜底：
          // * 没有 src 属性，则读取 <script type="module">xxx</script> 中 xxx 的内容
          // * 没有 module 属性的话，不做解析
          // * 只需要 解析一层即可

          let match: RegExpExecArray | null
          const isHtml = resolveInfo.path.endsWith('.html')
          // todo support for vue
          const isVue = resolveInfo.path.endsWith('.vue')
          const regex = isHtml ? ScriptModuleRE : ScriptRE

          // * 解析 html
          if (isHtml) {
            let match = regex.exec(htmlContent)
            while (match) {
              const [, openTag, content] = match

              // * <script type="xxx" src="xxx"> 拿到 type
              const typeMatch = openTag.match(TYPERE)
              const type = typeMatch && (typeMatch[1] || typeMatch[2] || typeMatch[3])

              // * type 不是 module 则跳过
              if (type !== 'module')
                continue

              // * 获取 src 属性
              const srcMatch = openTag.match(SRCRE)
              const src = srcMatch && (srcMatch[1] || srcMatch[2] || srcMatch[3])

              // * 存在 src 则将 src 转化为 import 语句，添加到 contents 中
              if (src) {
                if (src.startsWith('/'))
                  contents += `import ${JSON.stringify(`.${src}`)}\n`
                else
                  contents += `import ${JSON.stringify(src)}\n`
              }
              // * 不存在 src 则需要 分析 content 的内容
              else {
                const [imports] = parse(content)
                for (const info of imports) {
                  const { ss: variableStart, se: variableEnd } = info

                  // * 获取 import 语句 放入 contents 中
                  contents += `${content.slice(variableStart, variableEnd)}`
                }
              }
              match = regex.exec(htmlContent)
            }
          }
          return {
            loader: 'js',
            contents,
            resolveDir: config.root,
          }
        },
      )

      // 忽略的 文件类型
      build.onResolve(
        { filter: new RegExp(`\\.${EXTERNAL_TYPES.join('|')}$`) },
        (resolveInfo) => {
          return {
            path: resolveInfo.path,
            // 打上 external 标签
            external: true,
          }
        },
      )

      build.onResolve(
        { filter: BARE_IMPORT_RE },
        (resolveInfo) => {
          const { path: id } = resolveInfo

          // 推入 deps 集合中
          // deps.add(id)

          return {
            path: id,
            external: true,
          }
        },
      )
    },
  }
}
