import { getApiBaseUrl, parseErrorMessage } from "./api"

/** Mirrors packages/protocol's ProviderStreamEvent — the wire format streamed by the API as `data: <json>\n\n` SSE frames. */
export type AgentStreamEvent =
  | { type: "stream_started"; providerId: string; responseId?: string }
  | { type: "text_delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "tool_call_start"; id: string; name: string }
  | { type: "tool_call_delta"; id: string; argumentsDelta: string }
  | { type: "tool_call"; id: string; name: string; arguments: Record<string, unknown>; providerMetadata?: Record<string, unknown> }
  | { type: "usage"; inputTokens: number; outputTokens: number; cachedTokens: number; reasoningTokens?: number }
  | { type: "error"; providerId: string; code: string; message: string; retryable: boolean }
  | { type: "done"; stopReason: string; responseId?: string }
  | { type: "compaction_started" }
  | { type: "compaction_delta"; text: string }
  | { type: "compaction_completed"; coversFromSequence: number; coversToSequence: number }

export type AgentMode = "ASK" | "PLAN" | "CODE" | "AUTO"
export type ThinkingLevel = "INSTANT" | "MID" | "HIGH"

async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentStreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let separatorIndex: number
    while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, separatorIndex)
      buffer = buffer.slice(separatorIndex + 2)

      const dataLine = frame.split("\n").find((line) => line.startsWith("data: "))
      if (!dataLine) continue

      try {
        yield JSON.parse(dataLine.slice("data: ".length)) as AgentStreamEvent
      } catch {
        // malformed frame — skip rather than crash the whole stream
      }
    }
  }
}

async function openStream(path: string, body: unknown): Promise<{ sessionId: string; events: AsyncGenerator<AgentStreamEvent> }> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok || !response.body) {
    throw new Error(await parseErrorMessage(response))
  }

  const sessionId = response.headers.get("X-Session-Id")
  if (!sessionId) {
    throw new Error("The server did not return a session id.")
  }

  return { sessionId, events: parseSse(response.body) }
}

export function startAgentTurn(input: {
  providerId: string
  modelId: string
  credentialLabel: string
  message: string
  thinkingLevel: ThinkingLevel
  title?: string
}) {
  return openStream("/api/v1/agent-session", { ...input, mode: "ASK" satisfies AgentMode })
}

export function continueAgentTurn(
  sessionId: string,
  input: { credentialLabel: string; message: string; thinkingLevel: ThinkingLevel },
) {
  return openStream(`/api/v1/agent-session/${sessionId}/interactions`, { ...input, mode: "ASK" satisfies AgentMode })
}

export type ToolResultInput = {
  toolCallId: string
  name: string
  category: "backend" | "user"
  content: string
  isError: boolean
}

export function continueAgentTurnWithToolResults(
  sessionId: string,
  input: { credentialLabel: string; toolResults: ToolResultInput[] },
) {
  return openStream(`/api/v1/agent-session/${sessionId}/interactions`, { ...input, mode: "ASK" satisfies AgentMode })
}
