import { defineConfig } from 'mini-vite'

export default defineConfig({
  clearScreen: false,
  css: {},
  resolve: {
    alias: {
      '@': './src',
    },
  },
  // server: {
  //   port: 3000,
  // },
})
