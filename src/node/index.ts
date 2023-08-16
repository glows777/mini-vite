import { InlineConfig } from "./config"
import { startDevServer } from "./server"

export { InlineConfig, startDevServer }
export function defineConfig(config: InlineConfig) {
  return config
}