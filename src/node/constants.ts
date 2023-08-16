import path from "path"

export const EXTERNAL_TYPES = [
  "css",
  "less",
  "sass",
  "scss",
  "styl",
  "stylus",
  "pcss",
  "postcss",
  "vue",
  "svelte",
  "marko",
  "astro",
  "png",
  "jpe?g",
  "gif",
  "svg",
  "ico",
  "webp",
  "avif",
]

export const JS_TYPES_RE = /\.(?:j|t)sx?$|\.mjs$/
export const BARE_IMPORT_RE = /^[\w@][^:]/
export const QEURY_RE = /\?.*$/s
export const HASH_RE = /#.*$/s
export const PRE_BUNDLE_DIR = path.join("node_modules", ".m-vite")
export const DEFAULT_EXTERSIONS = [".tsx", ".ts", ".jsx", "js"]
export const HMR_HEADER = "vite-hmr"
export const CLIENT_PUBLIC_PATH = "/@vite/client"
export const HMR_PORT = 24678

export const DEFAULT_CONFIG_FILES = [
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "vite.config.cjs",
  "vite.config.mts",
  "vite.config.cts",
]