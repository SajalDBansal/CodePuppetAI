import { ProviderStreamRequest } from "@workspace/protocol"

export function getSystemPrompt(request: ProviderStreamRequest): string | undefined {
    const systemMessages = request.messages.filter(message => message.role === "system").map(message => message.content)

    const prompts = [request.systemPrompt, ...systemMessages].filter(Boolean)

    return prompts.length ? prompts.join("\n\n") : undefined
}