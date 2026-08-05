import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const packageJson = require("../package.json") as { version: string, name: string }

export const AGENT_NAME = packageJson.name
export const CLI_VERSION = packageJson.version

export const DEFAULT_API_URL = "https://backend.codepuppet.sajaldbansal.com/api/v1"
