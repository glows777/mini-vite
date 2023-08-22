import type { Plugin } from '../plugin'
import { resolvePlugin } from './resolve'
import { esbuildTransformPlugin } from './esbuild'
import { importAnalysisPlugin } from './importAnalysis'
import { cssPlugin } from './css'
import { assertPlugin } from './assert'
import { clientInjectPlugin } from './clientInject'
import { aliasPlugin } from './aliasPlugin'

export {
  resolvePlugin,
  esbuildTransformPlugin,
  importAnalysisPlugin,
  cssPlugin,
  assertPlugin,
  clientInjectPlugin,
  aliasPlugin,
}

export function resolvePlugins(plugins: Plugin[]): Plugin[] {
  return plugins
}
