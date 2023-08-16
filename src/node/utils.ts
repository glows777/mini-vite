import os from "os"
import path from "path"
import { existsSync, statSync, readFileSync } from 'fs-extra'

import { CLIENT_PUBLIC_PATH, HASH_RE, JS_TYPES_RE, QEURY_RE } from './constants'

const INTERNAL_LIST = [CLIENT_PUBLIC_PATH, "/@react-refresh"]

export function slash(p: string): string {
  return p.replace(/\\/g, "/")
}

export const isWindows = os.platform() === "win32"

export function normalizePath(id: string): string {
  return path.posix.normalize(isWindows ? slash(id) : id)
}
export const cleanUrl = (url: string): string => 
  url.replace(HASH_RE, '').replace(QEURY_RE, '')

export const isJSRequest = (id: string): boolean => {
  id = cleanUrl(id)
  if (JS_TYPES_RE.test(id)) {
    return true
  }

  if (!path.extname(id) && !id.endsWith('/')) {
    return true
  }

  return false
}

export function getShortName(file: string, root: string) {
  return file.startsWith(root + "/") ? path.posix.relative(root, file) : file
}

export const isCssRequest = (id: string): boolean => 
  cleanUrl(id).endsWith('.css')

export function isImportRequest(url: string): boolean {
  return url.endsWith("?import")
}

export function isInternalRequest(url: string): boolean {
  return INTERNAL_LIST.includes(url)
}

export function removeImportQuery(url: string): string {
  return url.replace(/\?import$/, "")
}

//判断文件是否存在且是否是一个文件 返回文件内容
export declare interface LookupFileOptions {
  pathOnly?: boolean;
}
export function lookupFile(
  dir: string,
  formats: string[],
  options?: LookupFileOptions
): string | undefined {
  for (const format of formats) {
    const fullPath = path.resolve(dir, format)
    if (existsSync(fullPath) && statSync(fullPath).isFile()) {
      if (!options?.pathOnly) {
        return readFileSync(fullPath, "utf-8")
      } else {
        return fullPath
      }
    }
  }
}

export const dynamicImport = new Function('file', 'return import(file)')

export function isObject(value: unknown): value is Record<string, any> {
  return Object.prototype.toString.call(value) === "[object Object]"
}

export function isArray(value: unknown): value is any[] {
  return Array.isArray(value)
}

export function transformArray<T>(array: T) {
  return isArray(array) ? array : [array]
}

export async function asyncFlatten<T>(arr: T[]): Promise<T[]> {
  do {
    arr = (await Promise.all(arr)).flat(Infinity) as any
  } while (arr.some((v: any) => v?.then))
  return arr
}