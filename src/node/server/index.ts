import process from 'node:process'
import path from 'node:path'
import { createServer } from 'node:net'
import http from 'node:http'

// connect 是一个具有中间件机制的轻量级 Node.js 框架。
// 既可以单独作为服务器，也可以接入到任何具有中间件机制的框架中，如 Koa、Express
import connect from 'connect'

// picocolors 是一个用来在命令行显示不同颜色文本的工具
import { bgRed, blue, green, yellow } from 'picocolors'
import type { FSWatcher } from 'chokidar'
import chokidar from 'chokidar'

import { optimize } from '../optimizer'
import type { Plugin } from '../plugin'
import type { PluginContainer } from '../pluginContainer'
import { createPluginContainer } from '../pluginContainer'
import { ModuleGraph } from '../ModuleGraph'
import { createWebSocketServer } from '../ws'
import { bindingHMREvents } from '../hmr'

import type { InlineConfig, ResolvedConfig } from '../config'
import { mergeConfig, resolveConfig } from '../config'
import { resolveChokidarOptions } from '../utils'
import { indexHtmlMiddleware } from './middlewares/indexHtml'
import { transformMiddleware } from './middlewares/transform'
import { staticMiddleware } from './middlewares/static'

function portIsOccupied(port: number) {
  return new Promise((resolve) => {
    const server = createServer().listen(port)

    let isOccupied = false

    server.on('listening', () => {
      // * 端口未被占用 直接关闭 并返回
      server.close()
      resolve(isOccupied)
    })

    server.on('error', (error: Error & { code?: string }) => {
      // * 端口 被占用
      if (error.code === 'EADDRINUSE') {
        isOccupied = true
        resolve(isOccupied)
      }
    })
  })
}

export interface ServerContext {
  config: ResolvedConfig
  root: string
  pluginContainer: PluginContainer
  app: connect.Server
  plugins: Plugin[]
  moduleGraph: ModuleGraph
  ws: {
    send: (data: any) => void
    close: () => void
  }
  watcher: FSWatcher
  httpServer: http.Server | null
  restart(forceOptimize?: boolean): Promise<void>
  close(): Promise<void>
}

export async function startDevServer(inlineConfig: InlineConfig) {
  if (inlineConfig.clearScreen === undefined || inlineConfig.clearScreen)
    console.clear()

  const resolvedConfig = await resolveConfig(inlineConfig, 'serve', 'development')
  const plugins = resolvedConfig.plugins as Plugin[]
  const app = connect()
  const root = resolvedConfig.root || process.cwd()
  const startTime = Date.now()
  const ws = createWebSocketServer(app)
  const server = http.createServer(app)
  const serverConfig = resolvedConfig.server || {}

  // * 解析 watch 选项
  const resolvedWatchOptions = resolveChokidarOptions({
    disableGlobbing: true,
    ...serverConfig,
  })

  let defaultPort = 5173
  if (resolvedConfig.server?.port) {
    defaultPort = resolvedConfig.server.port
  }
  else {
    while (true) {
      const isOccupied = await portIsOccupied(defaultPort)
      if (!isOccupied) {
        // * 未占用
        break
      }
      console.log(yellow(`🥸 > ${defaultPort} is occupied, trying to open a new port by ${defaultPort} + 1`))
      defaultPort++
      if (defaultPort >= 2 ** 16)
        throw new Error(bgRed('💔 > 所有端口都被占用'))
    }
  }

  const pluginContainer = await createPluginContainer(resolvedConfig)
  const moduleGraph = new ModuleGraph(url => pluginContainer.resolveId(url))
  const watcher = chokidar.watch(path.resolve(root), resolvedWatchOptions)

  const restart = async (forceOptimize: boolean) => {
    let inlineConfig = resolvedConfig.inlineConfig
    inlineConfig.clearScreen = false

    // 是否需要 重新构建，是的话，修改配置文件
    if (forceOptimize) {
      inlineConfig = mergeConfig(inlineConfig, {
        optimizeDeps: {
          force: true,
        },
      })
    }
    // * 关闭 之前的 服务器
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    await serverContext.close()

    // * 重启 服务器
    await startDevServer(inlineConfig)
  }
  const close = async () => {
    await Promise.all([
      watcher.close(),
      ws.close(),
      pluginContainer.close(),
      server.close(),
    ])
  }

  const serverContext: ServerContext = {
    config: resolvedConfig,
    root,
    pluginContainer,
    app,
    plugins,
    moduleGraph,
    ws,
    watcher,
    httpServer: server,
    restart,
    close,
  }
  bindingHMREvents(serverContext)

  for (const plugin of plugins) {
    if (plugin.configureServer)
      await plugin.configureServer(serverContext)
  }

  app.use(indexHtmlMiddleware(serverContext))
  app.use(transformMiddleware(serverContext))
  app.use(staticMiddleware(serverContext.root))

  await pluginContainer.buildStart({})
  await optimize(root, resolvedConfig)
  server.listen(defaultPort, () => {
    console.log(
      green('🚀 No-Bundle 服务已经成功启动!'),
            `耗时: ${Date.now() - startTime}ms`,
    )
    console.log(`> 本地访问路径: ${blue(`http://localhost:${defaultPort}`)}`)
  })
}
