import { Plugin } from 'esbuild'

import { BARE_IMPORT_RE, EXTERNAL_TYPES} from '../constants'

export function scanPlugin(deps: Set<string>): Plugin {
    return {
        name:' esbuild:scan-deps',
        setup(build) {
            // 忽略的 文件类型
            build.onResolve(
                { filter: new RegExp(`\\.${EXTERNAL_TYPES.join('|')}$`) },
                (resolveInfo) => {
                    return {
                        path: resolveInfo.path,
                        // 打上 external 标签
                        external: true
                    }
                }
            )

            build.onResolve(
                { filter: BARE_IMPORT_RE },
                (resolveInfo) => {
                    const { path: id } = resolveInfo

                    // 推入 deps 集合中
                    deps.add(id)

                    return {
                        path: id,
                        external: true
                    }
                }
            )
        }
    }
}