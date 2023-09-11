import type { ModuleInfo, PartialResolvedId, TransformResult } from 'rollup'

import { cleanUrl, isCssRequest, isVirtual } from './utils'

export class ModuleNode {
  // 资源访问 url
  url: string
  // 资源绝对路径
  id: string | null = null
  // cleanUrl 去除 query hash 等参数的 id
  file: string | null = null
  // 当前模块的类型
  type: 'js' | 'css'
  // 当前模块的信息
  info?: ModuleInfo
  meat?: Record<string, any>
  // 该模块的引用方
  importers = new Set<ModuleNode>()
  // 该模块所依赖的模块
  importedModules = new Set<ModuleNode>()
  // 接受热更新的模块
  acceptedHmrDeps = new Set<ModuleNode>()
  acceptedHmrExports: Set<string> | null = null
  importedBindings: Map<string, Set<string>> | null = null
  // 是否接受自身更新
  isSelfAccepting?: boolean
  // 经过 transform 钩子后的编译结果
  transformResult: TransformResult | null = null
  // 上一次热更新的时间戳
  lastHMRTimestamp = 0
  constructor(url: string, setIsSelfAccepting = true) {
    this.url = url
    this.type = isCssRequest(url) ? 'css' : 'js'
    if (setIsSelfAccepting)
      this.isSelfAccepting = false
  }
}

// * module 依赖图 moduleNode 为单个元素，构成的图 moduleNode 代表一个文件模块
export class ModuleGraph {
  // 资源 url 到 ModuleNode 映射表
  urlToModuleMap = new Map<string, ModuleNode>()
  // 资源绝对路径到 ModuleNode 的映射表
  idToModuleMap = new Map<string, ModuleNode>()
  // 单个文件可能对应于具有不同查询的多个模块
  fileToModulesMap = new Map<string, Set<ModuleNode>>()
  safeModulesPath = new Set<string>()

  constructor(
    private resolveId: (url: string) => Promise<PartialResolvedId | null>,
  ) {}

  // * 通过绝对路径获取模块
  getModuleById(id: string): ModuleNode | undefined {
    return this.idToModuleMap.get(id)
  }

  // * 解析 url 为绝对路径后 获取模块
  async getModuleByUrl(rawUrl: string): Promise<ModuleNode | undefined> {
    const { url } = await this._resolve(rawUrl)
    return this.urlToModuleMap.get(url)
  }

  // * 根据 file 获取多个 子模块
  getModulesByFile(file: string): Set<ModuleNode> | undefined {
    return this.fileToModulesMap.get(file)
  }

  // 注册 新的 ModuleNode 节点
  async ensureEntryFromUrl(
    rawUrl: string,
    // * 是否接受自身更新
    setIsSelfAccepting = true,
  ): Promise<ModuleNode> {
    const { url, resolvedId } = await this._resolve(rawUrl)
    let mod = this.idToModuleMap.get(resolvedId)

    // 无缓存 更新 urlToModuleMap 和 idToModuleMap
    if (!mod) {
      mod = new ModuleNode(url, setIsSelfAccepting)
      mod.id = resolvedId
      this.urlToModuleMap.set(url, mod)
      this.idToModuleMap.set(resolvedId, mod)
      const file = (mod.file = cleanUrl(resolvedId))
      let fileMappedModules = this.fileToModulesMap.get(file)
      if (!fileMappedModules) {
        fileMappedModules = new Set()
        this.fileToModulesMap.set(file, fileMappedModules)
      }
      fileMappedModules.add(mod)
    }
    else if (!this.urlToModuleMap.has(url)) {
      this.urlToModuleMap.set(url, mod)
    }

    return mod
  }

  // 绑定 ModuleNode 依赖关系
  async updateModuleInfo(
    mod: ModuleNode,
    importedModules: Set<string | ModuleNode>,
    importedBindings: Map<string, Set<string>> | null = null,
    acceptedModules: Set<string | ModuleNode> = new Set(),
    acceptedExports: Set<string> | null = new Set(),
    isSelfAccepting: boolean = false,
  ) {
    // * 更新模块的时候 必须传入是否接受自身更新
    mod.isSelfAccepting = isSelfAccepting

    // * 之前的模块依赖
    const prevImports = mod.importedModules
    // * 更新后的模块依赖
    const nextImports = (mod.importedModules = new Set())

    let noLongerImported: Set<ModuleNode> | undefined

    for (const curImports of importedModules) {
      // * 判断当前依赖是否存在，不存在则创建新的 ModuleNode
      const dep = typeof curImports === 'string'
        ? await this.ensureEntryFromUrl(curImports)
        : curImports
      // * 依赖的引用者就是当前 mod
      dep.importers.add(mod)
      // * 将更新后的依赖 放入 最新的容器中
      nextImports.add(dep)
    }

    // * 清除 不再引用的 依赖
    // * import a from 'a';import b from 'b' 更新后变为
    // * import b from 'b' , 那么就会少了一个模块
    // * 也就是对于 a 模块来说少了一个引用者, 那么删除这个引用者
    // * 如果删除后 a 模块没有引用者了
    // * 则这个依赖放入 noLongerImported 中 表示不会再引用这个模块
    for (const prevImport of prevImports) {
      if (!nextImports.has(prevImport)) {
        prevImport.importers.delete(mod)
        if (!prevImport.importers.size)
          (noLongerImported || (noLongerImported = new Set())).add(prevImport)
      }
    }

    // * 更新 mod 接受的模块
    const deps = (mod.acceptedHmrDeps = new Set())
    for (const accepted of acceptedModules) {
      const dep = typeof accepted === 'string'
        ? await this.ensureEntryFromUrl(accepted)
        : accepted
      deps.add(dep)
    }

    // * 更新接受的 exports
    mod.acceptedHmrExports = acceptedExports
    mod.importedBindings = importedBindings
    // * 返回不再 import 的依赖
    return noLongerImported
  }

  invalidateModule(mod: ModuleNode) {
    mod.transformResult = null
  }

  invalidateAll() {
    this.idToModuleMap.forEach(mod => this.invalidateModule(mod))
  }

  // 当文件改变的时候调用
  onFileChange(file: string): void {
    // * 获取改变的所有模块
    const mods = this.getModulesByFile(file)
    if (mods) {
      mods.forEach((mod) => {
        // * 初始化模块
        this.invalidateModule(mod)
      })
    }
  }

  // * 调用传入的 resolve 函数解析路径
  private async _resolve(url: string): Promise<{ url: string; resolvedId: string }> {
    let resolvedId: string
    if (isVirtual(url)) {
      resolvedId = url
    }
    else {
      const resolved = await this.resolveId(url)
      resolvedId = resolved?.id || url
    }
    return {
      url,
      resolvedId,
    }
  }
}
