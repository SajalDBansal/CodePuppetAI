import { Harness } from "@workspace/harness/store"
import { Logger } from "../presentation/logger.js";
import { AGENT_NAME, CLI_VERSION, DEFAULT_API_URL } from "../constants.js";

export const ENV_CONFIG = {
    AGENT_NAME,
    AGENT_DEBUG: process.env.AGENT_DEBUG,
    CODE_PUPPET_API_URL: process.env.CODE_PUPPET_API_URL || DEFAULT_API_URL,
    VERSION: CLI_VERSION,
}

export function resolveApiUrl(): string {
    return (ENV_CONFIG.CODE_PUPPET_API_URL).replace(/\/$/, "")
}

export const apiUrl = resolveApiUrl();
export const harness = new Harness(apiUrl);
export const logger = new Logger({ debug: ENV_CONFIG.AGENT_DEBUG === "1" })
