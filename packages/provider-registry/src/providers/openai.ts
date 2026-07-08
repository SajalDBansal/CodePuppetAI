
import { ProviderAdapter, ProviderCredentials, ProviderStreamEvent, ProviderStreamRequest } from "../types.js";

import OpenAI from "openai";


type OpenAIClientGenerator = (apiKey: string) => OpenAI

export class OpenaiProvider implements ProviderAdapter {
    readonly id = "openai" as const

    constructor(
        private readonly createClient: OpenAIClientGenerator = (apiKey) => new OpenAI({ apiKey })
    ) { }

    async *stream(
        request: ProviderStreamRequest,
        credentials: ProviderCredentials,
        signal?: AbortSignal
    ): AsyncGenerator<ProviderStreamEvent, void, unknown> {

    }
}
