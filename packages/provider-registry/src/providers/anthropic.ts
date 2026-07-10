import Anthropic from "@anthropic-ai/sdk";
import { ProviderAdapter, ProviderCredentials, ProviderStopReason, ProviderStreamEvent, ProviderStreamRequest } from "@workspace/protocol";

type AnthropicClientGenerator = (apiKey: string) => Anthropic

export class AnthropicProvider implements ProviderAdapter {
    readonly id = "anthropic" as const

    constructor(
        private readonly createClient: AnthropicClientGenerator = (apiKey) => new Anthropic({ apiKey })
    ) { }

    async *stream(
        request: ProviderStreamRequest,
        credentials: ProviderCredentials,
        signal?: AbortSignal
    ): AsyncGenerator<ProviderStreamEvent, void, unknown> {

    }
}

