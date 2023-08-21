import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    cli: 'src/node/cli.ts',
    client: 'src/client/client.ts',
    index: 'src/node/index.ts',
  },
  // 产物格式，包含 esm 和 cjs 格式
  format: ['esm', 'cjs'],
  // 目标语法
  target: 'es2020',
  // 生成 sourcemap
  sourcemap: true,
  // 没有拆包的需求，关闭拆包能力
  splitting: false,
  dts: true,
})
