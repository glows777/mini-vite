import { resolvePlugin } from './resolve'
import { esbuildTransformPlugin  } from './esbuild'
import { importAnalysisPlugin } from './importAnalysis'
import { Plugin } from '../plugin'

export function resolvePlugins(): Plugin[] {
    return [
        resolvePlugin(),
        esbuildTransformPlugin(), 
        importAnalysisPlugin()
    ]
}