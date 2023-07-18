console.log('[m-vite] connecting...')

// 创建 客户端 WebSocket 实例
// 其中的 __HMR_PORT__ 之后会被 no-bundle 服务编译成具体的端口号
const socket = new WebSocket('ws://localhost:__HMR_PORT__', 'vite-hmr')

// 接受服务端的 更新信息
socket.addEventListener('message', async ({ data }) => {
    handleMessage(JSON.parse(data))
        .catch(console.error)
})

interface Update {
    type: "js-update" | "css-update";
    path: string;
    acceptedPath: string;
    timestamp: number;
}

async function handleMessage(payload: any) {
    switch (payload.type) {
        case 'connected': 
            console.log('[m-vite] connected')

            // 心跳检测
            setInterval(() => socket.send('ping'), 1000)
            break
        // 具体模块更新
        case 'update': 
            //进行 具体模块更新
            payload.updates.forEach((update: Update) => {
                if (update.type === "js-update") {
                    fetchUpdate(update)
                }
            })
            break
    }
}

interface HotCallback {
    deps: string[]
    fn: (modules: object[]) => void
}
interface HotModule {
    id: string
    callbacks: HotCallback[]
}

// HMR 模块表
const hotModulesMap = new Map<string, HotModule>()
// 不再生效的 模块表
const pruneMap = new Map<string, (data: any) => void | Promise<void>>()

export const createHotContext = (ownerPath: string) => {
    const mod = hotModulesMap.get(ownerPath)

    if (mod) {
        mod.callbacks = []
    }

    function acceptDeps(deps: string[], callback: any) {
        const mod: HotModule = hotModulesMap.get(ownerPath) || {
            id: ownerPath,
            callbacks: []
        }

        // callbacks 属性存放 accept 的依赖、依赖改动后对应的回调逻辑
        mod.callbacks.push({
            deps,
            fn: callback
        })
        hotModulesMap.set(ownerPath, mod)
    }

    return {
        accept(deps: any, callback: any) {
            // 这里仅考虑接受自身模块更新的情况
            // import.meta.hot.accept()
            if (typeof deps === 'function' || !deps) {
                // @ts-ignore
                acceptDeps([ownerPath], ([mod]) => deps && deps(mod))
            }
        },
        // 模块不再生效的回调
        // import.meta.hot.prune(() => {})
        prune(cb: (data: any) => void) {
            pruneMap.set(ownerPath, cb)
        }
    }
}

export async function fetchUpdate({ path, timestamp }: Update) {
    const mod = hotModulesMap.get(path)
    console.log(mod)
    if (!mod) return

    const moduleMap = new Map()
    const modulesToUpdate = new Set<string>()
    modulesToUpdate.add(path)
    console.log(path)
    await Promise.all(
        Array.from(modulesToUpdate).map(async dep => {
            const [path, query] = dep.split('?')
            try {
                // 通过动态 import 拉取最新模块
                const newMod = await import(
                    path + `?t=${timestamp}${query ? `&${query}` : '' }`
                )
                moduleMap.set(dep, newMod)
            } catch (error) {

            }
        })
    )
    return () => {
        // 拉取最新模块后 应执行更新回调
        for (const { deps, fn } of mod.callbacks) {
            fn(deps.map((dep: any) => moduleMap.get(dep)))
        }
        console.log(`[m-vite] hot update: ${path}`)
    }
}


