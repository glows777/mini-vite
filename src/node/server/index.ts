// connect 是一个具有中间件机制的轻量级 Node.js 框架。
// 既可以单独作为服务器，也可以接入到任何具有中间件机制的框架中，如 Koa、Express
import connect from 'connect'
// picocolors 是一个用来在命令行显示不同颜色文本的工具
import { blue, green} from 'picocolors'
import chokidar, { FSWatcher } from 'chokidar'

import { optimize } from '../optimizer'
import { resolvePlugins } from '../plugins'
import { Plugin } from '../plugin'
import { createPluginContainer, PluginContainer } from '../pluginContainer'
import { ModuleGraph } from '../ModuleGraph'
import { createWebSocketServer } from '../ws'
import { bindingHMREvents } from '../hmr'
import { normalizePath } from '../utils'

import { indexHtmlMiddleware } from './middlewares/indexHtml'
import { transformMiddleware } from './middlewares/transform'
import { staticMiddleware } from './middlewares/static'
import { InlineConfig, resolveConfig } from '../config'

export interface ServerContext {
    root: string,
    pluginContainer: PluginContainer,
    app: connect.Server,
    plugins: Plugin[],
    moduleGraph: ModuleGraph,
    ws: { 
        send: (data: any) => void,
        close: () => void
    },
    watcher: FSWatcher
} 

export async function startDevServer(inlineConfig: InlineConfig) {
    if (inlineConfig.clearScreen === undefined || inlineConfig.clearScreen) {
        console.clear()
    }

    const resolvedConfig = await resolveConfig(inlineConfig, 'serve', 'development')
    // console.log(resolvedConfig)

    const app = connect()
    const root = process.cwd()
    const startTime = Date.now()

    const plugins = resolvePlugins()
    const moduleGraph = new ModuleGraph(url => pluginContainer.resolveId(url))
    const pluginContainer = createPluginContainer(plugins)

    const watcher = chokidar.watch(root, {
        ignored: ['**/node_modules/**', '**/.git/**'],
        ignoreInitial: true
    })
    const ws = createWebSocketServer(app)

    const serverContext: ServerContext = {
        root: process.cwd(),
        pluginContainer: pluginContainer,
        app,
        plugins,
        moduleGraph,
        ws,
        watcher
    }
    bindingHMREvents(serverContext)

    for (const plugin of plugins) {
        if (plugin.configureServer) {
            await plugin.configureServer(serverContext)
        }
    }
    app.use(transformMiddleware(serverContext))
    app.use(indexHtmlMiddleware(serverContext))
    app.use(staticMiddleware(serverContext.root))
    app.listen(3000, async () => {
        await optimize(root)
        
        console.log(
            green('🚀 No-Bundle 服务已经成功启动!'),
            `耗时: ${Date.now() - startTime}ms`
        )
        console.log(`> 本地访问路径: ${blue('http://localhost:3000')}`)
    })
}

export interface ServerContext {}