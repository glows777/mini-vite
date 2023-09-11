import path from 'node:path'

import { readFile } from 'fs-extra'
import esbuild from 'esbuild'

import type { Plugin } from '../plugin'
import { error, isCssRequest, isJSRequest, isVirtual } from '../utils'

export function esbuildTransformPlugin(): Plugin {
  return {
    name: 'm-vite:esbuild-transform',

    // 加载模块
    async load(id) {
      // * 不处理虚拟模块
      if (isVirtual(id))
        return undefined

      if (isJSRequest(id) || isCssRequest(id)) {
        try {
          const code = await readFile(id, 'utf-8')
          return code
        }
        catch (err) {
          error(`pluginError: 插件 [esbuildTransform] 读取 '${id}' 文件失败 ${err}`)
        }
      }
    },

    async transform(code, id) {
      if (isJSRequest(id) || isVirtual(id)) {
        let loader = ''
        // * 可以通过给虚拟模块开头添加 /*js|ts|tsx|jsx*/
        // * 告诉 vite 当前模块的类型 以便于编译
        if (isVirtual(id))
          // * 如果 虚拟模块没有支持 loader 则使用 js
          loader = getLoader(code) || 'js'
        else
          loader = path.extname(id).slice(1)

        const { code: transformCode, map } = await esbuild.transform(code, {
          target: 'esnext',
          format: 'esm',
          sourcemap: true,
          loader: loader as 'js' | 'ts' | 'jsx' | 'tsx',
        })
        return {
          code: transformCode,
          map,
        }
      }
      return null
    },
  }
}

function getLoader(code: string) {
  let loader = ''
  code = code.trim()
  if (code.startsWith('/*')) {
    let i = 0
    let isStart = false
    while (++i && i < code.length) {
      if (code[i - 1] + code[i] === '/*') {
        isStart = true
        continue
      }
      if (isStart === true) {
        loader += code[i]
        if (code[i + 1] + code[i + 2] === '*/')
          break
      }
    }
  }
  else { return undefined }
  return loader
}
