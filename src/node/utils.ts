import os from 'node:os'
import path from 'node:path'
import { existsSync, readFileSync, statSync } from 'fs-extra'

import type { ChokidarOptions } from 'rollup'
import { bgRed } from 'picocolors'
import { CLIENT_PUBLIC_PATH, HASH_RE, JS_TYPES_RE, QEURY_RE } from './constants'
import type { WatchOptions } from './config'

const INTERNAL_LIST = [CLIENT_PUBLIC_PATH, '/@react-refresh']

export function slash(p: string): string {
  return p.replace(/\\/g, '/')
}

export const isWindows = os.platform() === 'win32'

export function normalizePath(id: string): string {
  return path.posix.normalize(isWindows ? slash(id) : id)
}
export function cleanUrl(url: string): string {
  return url.replace(HASH_RE, '').replace(QEURY_RE, '')
}

export function isJSRequest(id: string): boolean {
  id = cleanUrl(id)
  if (JS_TYPES_RE.test(id))
    return true

  if (!path.extname(id) && !id.endsWith('/'))
    return true

  return false
}

export function getShortName(file: string, root: string) {
  return file.startsWith(`${root}/`) ? path.posix.relative(root, file) : file
}

export function isCssRequest(id: string): boolean {
  return cleanUrl(id).endsWith('.css')
}

export function isImportRequest(url: string): boolean {
  return url.endsWith('?import')
}

export function isInternalRequest(url: string): boolean {
  return INTERNAL_LIST.includes(url)
}

export function removeImportQuery(url: string): string {
  return url.replace(/\?import$/, '')
}

// 判断文件是否存在且是否是一个文件 返回文件内容
export declare interface LookupFileOptions {
  pathOnly?: boolean
}
export function lookupFile(
  dir: string,
  formats: string[],
  options?: LookupFileOptions,
): string | undefined {
  for (const format of formats) {
    const fullPath = path.resolve(dir, format)
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      if (!options?.pathOnly)
        return readFileSync(fullPath, 'utf-8')
      else
        return fullPath
    }
  }
}

// eslint-disable-next-line no-new-func
export const dynamicImport = new Function('file', 'return import(file)')

export function isObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

export function isArray(value: unknown): value is any[] {
  return Array.isArray(value)
}

export function transformArray<T>(array: T) {
  return isArray(array) ? array : [array]
}

export async function asyncFlatten<T>(arr: T[]): Promise<T[]> {
  do
    arr = (await Promise.all(arr)).flat(Number.POSITIVE_INFINITY) as any
  while (arr.some((v: any) => v?.then))
  return arr
}

// 判断当前 alias 是否需要替换
export function matches(pattern: string | RegExp, importee: string) {
  if (pattern instanceof RegExp)
    return pattern.test(importee)

  if (importee.length < pattern.length)
    return false

  if (importee === pattern)
    return true

  return importee.startsWith(`${pattern}/`)
}

export function resolveChokidarOptions(
  options: WatchOptions | ChokidarOptions,
) {
  const { ignored = [], ...otherOptions } = options ?? {}
  const resolvedWatchOptions = {
    // 部分文件如 node_modules .git 等不需要被监听
    ignored: [
      '**/.git/**',
      '**/node_modules/**',
      '**/dist/**',
      ...(isArray(ignored) ? ignored : [ignored]),
    ],
    ignoreInitial: true,
    ignorePermissionErrors: true,
    ...otherOptions,
  }
  return resolvedWatchOptions
}

export interface ErrorOpts {
  beforeStr?: string
  afterStr?: string
}
export function error(err: string, opts?: ErrorOpts) {
  let str = ''

  const { beforeStr, afterStr } = opts || {}
  if (beforeStr)
    str += beforeStr

  str += `❌ ${bgRed(err)}`
  if (afterStr)
    str += afterStr

  console.log(str)
}

// 获取 第三方包 路径
export function getPkgModulePath(moduleName: string, root: string) {
  // * 处理 react/jsx-runtime 这种情况
  if (moduleName.includes('/')) {
    let ext = ''
    const resolvedRoot = path.resolve(root, 'node_modules', moduleName)

    // 如果不是 .js 或者 .ts 结尾，则需要添加
    if (!resolvedRoot.endsWith('.ts') && !resolvedRoot.endsWith('.js')) {
      if (existsSync(`${resolvedRoot}.js`))
        ext = '.js'

      else if (existsSync(`${resolvedRoot}.ts`))
        ext = '.ts'
    }

    const normalizeRoot = normalizePath(resolvedRoot + ext)
    return normalizeRoot
  }

  // * 处理 react redux 这种情况
  const pkg = lookupFile(root, [`node_modules/${moduleName}/packages.json`])
  if (pkg) {
    const json = JSON.parse(pkg)
    const main = json.main.endsWith('.js') ? json.main : `${json.main}.js`
    const packageRoot = main || 'index.js'
    const resolvedRoot = path.resolve(
      root,
      'node_modules',
      moduleName,
      packageRoot,
    )

    const normalizedRoot = normalizePath(resolvedRoot)
    return normalizedRoot
  }
  else {
    throw new Error(bgRed(`😠 > can not find module ${moduleName}`))
  }
}

export function flattenId(id: string) {
  return id
    .replace(/[\/:]/g, '_')
    .replace(/[\.]/g, '__')
    .replace(/(\s*>\s*)/g, '___')
}
