import path from 'node:path'
import process from 'node:process'
import { blue, green, red } from 'picocolors'

import { promises } from 'fs-extra'
import type { ServerContext } from './server'
import { getShortName, normalizePath, osPath, unique } from './utils'
import type { ModuleNode } from './ModuleGraph'
import type { Plugin } from './plugin'

export interface HmrContext {
  file: string
  timestamp: number
  modules: Array<ModuleNode>
  read: () => string | Promise<string>
  serverContext: ServerContext
}

export interface Boundary {
  boundary: ModuleNode
  acceptedVia: ModuleNode
}

export function bindingHMREvents(serverContext: ServerContext) {
  const { watcher, ws, root, moduleGraph, config } = serverContext
  const serverConfig = config.server || {}

  watcher.on('change', async (file) => {
    moduleGraph.onFileChange(osPath(normalizePath(file)))
    if (serverConfig.hmr !== false) {
      try {
        await handleHMRUpdate(file, serverContext)
      }
      catch (err) {
        ws.send({
          type: 'error',
          err,
        })
      }
    }
  })

  watcher.on('add', file => handleFileAddUnlink(file, serverContext))
  watcher.on('unlink', file => handleFileAddUnlink(file, serverContext))
}

export async function handleHMRUpdate(
  file: string,
  serverContext: ServerContext,
) {
  file = osPath(file)
  // console.log(file)
  const { moduleGraph, ws, config, root } = serverContext
  const basename = path.basename(file)
  const shortFileName = getShortName(file, root)

  // * 如果 改变的是 配置文件，则需要重启服务器
  if (basename.startsWith('vite.config')) {
    console.clear()
    console.log(`✨${blue('[hmr]')} ${green(
      `config file '${path.relative(process.cwd(), file)}' changed, restarting server...
    `)}`)
    try {
      await serverContext.restart()
    }
    catch (err) {
      console.log(`😭 ${blue('[hmr]:')} ${red(`serverError: failed starting dev server ${err}`)}`)
    }
    return
  }
  console.log(`✨${blue('[hmr]')} ${green(getShortName(file, root))} changed`)

  // * 处理 更新逻辑
  const mods = moduleGraph.getModulesByFile(normalizePath(file))
  // console.log(mods)
  const timestamp = Date.now()
  const hmrContext: HmrContext = {
    // * 热更新改变的文件
    file,
    // * 时间戳
    timestamp,
    // * 当前文件 对应的模块
    modules: mods ? [...mods] : [],
    // * 获取 改变的文件
    read: () => readModifiedFile(file),
    serverContext,
  }

  // * 调用 handleHotUpdate 插件钩子
  for (const plugin of config.plugins) {
    const hook = (plugin as Plugin)?.handleHotUpdate
    if (hook) {
      const filteredModules = await hook(hmrContext)
      if (filteredModules)
        hmrContext.modules = filteredModules
    }
  }

  if (!hmrContext.modules.length) {
    // * html 文件不可以被热重载
    if (file.endsWith('.html')) {
      console.log(`✨${blue('[hmr]:')} ${green('browser page reloading...')}`)
      // * 发送 full-reload 到客户端，通知更新
      ws.send({
        type: 'full-reload',
        path: normalizePath(path.relative(root, file)),
      })
    }
    else {
      // * 监听到的文件不在项目引入文件范围内
      ws.send({
        type: 'log',
        data: `[m-vite]: '${shortFileName}' is not within the scope of the files imported by the project and will not be hot module updated`,
      })
    }
    return
  }
  updateModules(shortFileName, hmrContext.modules, timestamp, serverContext)
}

async function readModifiedFile(file: string) {
  return await promises.readFile(file, 'utf-8')
}

export function updateModules(
  file: string,
  modules: ModuleNode[],
  timestamp: number,
  { config, ws }: ServerContext,
) {
  const updates = []
  const invalidatedModules = new Set<ModuleNode>()
  let needFullReload = false
  for (const mod of modules) {
    // * 模块更新边界
    const boundaries = new Set<Boundary>()
    // * 收集 热边界
    const hasDeadEnd = propagateUpdate(mod, boundaries)
    // console.log(boundaries)

    invalidate(mod, timestamp, invalidatedModules)
    if (needFullReload)
      continue
    if (hasDeadEnd) {
      needFullReload = true
      continue
    }

    updates.push(
      ...[...boundaries].map((({ boundary, acceptedVia }) => ({
        type: `${boundary.type}-update`,
        timestamp,
        path: boundary.url,
        acceptedPath: acceptedVia.url,
      }))),
    )
    // console.log(boundaries)
  }
  if (needFullReload) {
    console.log(`✨${blue('[hmr]')} ${green(`page reloaded ${file}`)}`)
    ws.send({
      type: 'full-reload',
    })
    return
  }

  if (updates.length === 0)
    return

  console.log(
    updates.map(({ path }) =>
        `✨${
          blue('[hmr] ')
          }${green(`hot module updated ${path}`)}`,
    ).join('\n'),
  )
  ws.send({
    type: 'update',
    updates,
  })
}

export function invalidate(
  mod: ModuleNode,
  timestamp: number,
  seen: Set<ModuleNode>,
) {
  if (seen.has(mod))
    return

  seen.add(mod)
  mod.lastHMRTimestamp = timestamp
  mod.transformResult = null
  mod.importers.forEach((importer) => {
    if (!importer.acceptedHmrDeps.has(mod))
      invalidate(importer, timestamp, seen)
  })
}

export function propagateUpdate(
  node: ModuleNode,
  boundaries: Set<Boundary>,
  currentChain = [node],
) {
  // * 接受自身热更新
  if (node.isSelfAccepting) {
    boundaries.add({
      boundary: node,
      acceptedVia: node,
    })
    // * 不需要页面刷新
    return false
  }

  // * 入口模块 进行页面刷新
  if (!node.importers.size)
    return true

  for (const importer of node.importers) {
    const subChain = currentChain.concat(importer)
    if (importer.acceptedHmrDeps.has(node)) {
      boundaries.add({
        boundary: importer,
        acceptedVia: node,
      })
      continue
    }
    // * 出现循环依赖 则直接刷新页面
    if (currentChain.includes(importer))
      return true

    // * 递归，找寻更上层的 热更新边界
    if (propagateUpdate(importer, boundaries, subChain))
      return true
  }
  return false
}

export async function handleFileAddUnlink(
  file: string,
  serverContext: ServerContext,
) {
  // todo 删除文件的 modules, 新增暂时不处理
  const modules = [...(serverContext.moduleGraph.getModulesByFile(file) || [])]
  if (modules.length !== 0) {
    updateModules(
      getShortName(file, serverContext.root),
      unique(modules),
      Date.now(),
      serverContext,
    )
  }
}

export function handlePrunedModules(
  mods: Set<ModuleNode>,
  { ws }: ServerContext,
) {
  const timestamp = Date.now()
  mods.forEach((mod) => {
    mod.lastHMRTimestamp = timestamp
  })
  ws.send({
    type: 'prune',
    paths: [...mods].map(mod => mod.url),
  })
}
