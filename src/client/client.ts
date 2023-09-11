interface HotCallback {
  deps: string[]
  fn: (modules: object[]) => void
}
interface HotModule {
  id: string
  callbacks: HotCallback[]
}

console.log('[m-vite] connecting...')

// HMR 模块表
const hotModulesMap = new Map<string, HotModule>()
// 不再生效的 模块表
const pruneMap = new Map<string, (data: any) => void | Promise<void>>()
// 模块销毁的回调函数
// eslint-disable-next-line @typescript-eslint/ban-types
const disposeMap = new Map<string, Function>()
// 获取热更新传递的数据
const dataMap = new Map<string, any>()

// 创建 客户端 WebSocket 实例
// 其中的 __HMR_PORT__ 之后会被 no-bundle 服务编译成具体的端口号
const socket = new WebSocket('ws://localhost:__HMR_PORT__', 'vite-hmr')

// 接受服务端的 更新信息
socket.addEventListener('message', async ({ data }) => {
  handleMessage(JSON.parse(data))
    .catch(console.error)
})

interface Update {
  type: 'js-update' | 'css-update'
  path: string
  acceptedPath: string
  timestamp: number
}

async function handleMessage(payload: any) {
  switch (payload.type) {
    case 'connected':
      console.log('[m-vite] connected')

      // 心跳检测
      setInterval(() => {
        if (socket.readyState === socket.OPEN)
          socket.send(JSON.stringify({ type: 'ping' }))
      }, 1000)
      break
      // 具体模块更新
    case 'update':
      // 进行 具体模块更新
      payload.updates.forEach((update: Update) => {
        if (update.type === 'js-update')
          queueUpdate(fetchUpdate(update))
        else if (update.type === 'css-update')
          queueUpdate(fetchUpdate(update))
      })
      break
    case 'full-reload':
      // * 刷新浏览器
      document.location.reload()
      console.log('[m-vite] connecting...')
      break
    case 'log':
      console.log(payload.data)
      break
    case 'prune':
      payload.paths.forEach((path: string) => {
        const fn = pruneMap.get(path)
        if (fn)
          fn(dataMap.get(path))
      })
      break
    default:
      break
  }
}

export function createHotContext(ownerPath: string) {
  // * ownerPath 是当前变动模块相对于根目录的路径 /src/App.tsx

  if (!dataMap.has(ownerPath))
    dataMap.set(ownerPath, {})

  const mod = hotModulesMap.get(ownerPath)
  if (mod)
    mod.callbacks = []

  function acceptDeps(deps: string[], callback: any) {
    const mod: HotModule = hotModulesMap.get(ownerPath) || {
      id: ownerPath,
      callbacks: [],
    }

    // callbacks 属性存放 accept 的依赖、依赖改动后对应的回调逻辑
    mod.callbacks.push({
      deps,
      fn: callback,
    })
    hotModulesMap.set(ownerPath, mod)
  }

  return {
    get data() {
      return dataMap.get(ownerPath)
    },
    accept(deps: any, callback: any) {
      // import.meta.hot.accept()
      if (typeof deps === 'function' || !deps)
        acceptDeps([ownerPath], ([mod]: any) => deps && deps(mod))
      else if (typeof deps === 'string')
        acceptDeps([deps], (modules: any) => callback && callback(modules))
      else if (Array.isArray(deps))
        acceptDeps(deps, callback)
      else
        throw new Error('invalid hot.accept() usage')
    },
    // 模块不再生效的回调
    // import.meta.hot.prune(() => {})
    prune(cb: (data: any) => void) {
      pruneMap.set(ownerPath, cb)
    },
    // 当某个模块更新 销毁的时候调用
    // eslint-disable-next-line @typescript-eslint/ban-types
    dispose(cb: Function) {
      disposeMap.set(ownerPath, cb)
    },
    // 强制刷新页面
    invalidate() {
      location.reload()
    },
  }
}

export async function fetchUpdate({ path, timestamp, acceptedPath }: Update) {
  const mod = hotModulesMap.get(path)
  if (!mod)
    return () => {}

  const moduleMap = new Map()
  const modulesToUpdate = new Set<string>()
  const isSelfUpdate = path === acceptedPath
  if (isSelfUpdate) {
    // * 接受自身更新
    modulesToUpdate.add(path)
  }
  else {
    // * 接受子模块更新
    for (const { deps } of mod.callbacks) {
      deps.forEach((dep) => {
        if (acceptedPath === dep)
          modulesToUpdate.add(dep)
      })
    }
  }

  // * 整理需要执行的更新回调函数
  const qualifiedCallbacks = mod.callbacks.filter(({ deps }) => {
    return deps.some(dep => modulesToUpdate.has(dep))
  })

  await Promise.all(
    Array.from(modulesToUpdate).map(async (dep) => {
      const disposer = disposeMap.get(dep)
      if (disposer)
        await disposer(dataMap.get(dep))

      const [path, query] = dep.split('?')
      try {
        // * 通过动态 import 拉取最新模块
        // * /src/a.ts?import&t=xxxx
        const newMod = await import(
          `${path}?import&t=${timestamp}${query ? `&${query}` : ''}`
        )
        moduleMap.set(dep, newMod)
      }
      catch (err) {
        console.log(`拉取 ${path} 模块失败: ${err}`)
      }
    }),
  )
  return () => {
    // 拉取最新模块后 应执行更新回调
    for (const { deps, fn } of qualifiedCallbacks)
      fn(deps.map(dep => moduleMap.get(dep)))
    const loggedPath = isSelfUpdate
      ? path
      : `热模块边界 '${path}' 更新了 '${acceptedPath}' 模块`
    console.log(`[m-vite] hot update: ${loggedPath}`)
  }
}

let pending = false
let queued: Promise<() => void>[] = []
export async function queueUpdate(p: Promise<() => void>) {
  queued.push(p)
  if (!pending) {
    pending = true
    await Promise.resolve()
    pending = false
    const loading = [...queued]
    queued = [] as Promise<() => void>[]
    (await Promise.all(loading)).forEach(fn => fn && fn())
  }
}

// 添加 css 热更新
const sheetsMap = new Map<string, HTMLStyleElement>()

export function updateStyle(id: string, content: string) {
  let style = sheetsMap.get(id)
  if (!style) {
    style = document.createElement('style')
    style.setAttribute('type', 'text/css')
    style.innerHTML = content
    document.head.appendChild(style)
  }
  else {
    // 更新 style 标签
    style.innerHTML = content
  }
}

export function removeStyle(id: string) {
  const style = sheetsMap.get(id)

  if (style)
    document.head.removeChild(style)

  sheetsMap.delete(id)
}
