import { defineConfig, startDevServer } from 'mini-vite'

export default defineConfig({
    clearScreen: false,
    css: {},
    resolve: {
        alias: {
            '@': './src'
        }
    }
})