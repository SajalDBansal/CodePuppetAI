import { AnthropicProvider } from "./providers/anthropic.js";
import { GoogleProvider } from "./providers/google.js";
import { OpenaiProvider } from "./providers/openai.js";
import { ProviderRegistry } from "./registry.js"

export * from "./error.js"

export function createProviderRegistery(): ProviderRegistry {
    return new ProviderRegistry([
        new GoogleProvider(),
        new OpenaiProvider(),
        new AnthropicProvider()
    ]);
}