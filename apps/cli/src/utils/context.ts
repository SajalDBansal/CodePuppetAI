import { Harness } from "@workspace/harness/store"
import { Logger } from "../presentation/logger.js";


export const ENV_CONFIG = {
    AGENT_NAME: process.env.AGENT_NAME || "code-puppet",
    AGENT_DEBUG: process.env.AGENT_DEBUG,
    CODE_PUPPET_API_URL: process.env.CODE_PUPPET_API_URL || "http://localhost:3001/api/v1",
    VERSION: process.env.VERSION || "0.1.0"
}

export function resolveApiUrl(): string {
    return (ENV_CONFIG.CODE_PUPPET_API_URL).replace(/\/$/, "")
}

export const apiUrl = resolveApiUrl();
export const harness = new Harness(apiUrl);
export const logger = new Logger({ debug: ENV_CONFIG.AGENT_DEBUG === "1" })
