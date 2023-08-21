import process from 'node:process'
import cac from 'cac'

import { startDevServer } from './server'

const cli = cac()

cli
  .command('[]', 'Run the development server')
  .alias('dev')
  .alias('serve')
  .option('--root, [root]', '项目根目录, 默认为process.cwd()')
  .option('--mode, [mode]', '当前模式 development 或 production ')
  .action(async (options) => {
    // console.log('=========', options.root, options.mode)
    await startDevServer(
      {
        root: options.root || process.cwd(),
        base: options.base,
        mode: options.mode,
        configFile: options.config,
        optimizeDeps: { force: options.force },
        server: undefined,
      },
    )
  })

cli.help()

cli.parse()
