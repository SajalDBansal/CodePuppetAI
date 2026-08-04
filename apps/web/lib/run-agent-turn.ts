import type { AgentStreamEvent, ToolResultInput } from "./agent-stream"

export type PendingPrompt =
  | { kind: "confirmation"; toolCallId: string; toolName: string; prompt: string; detail?: string }
  | { kind: "question"; toolCallId: string; toolName: string; question: string; options?: string[] }

export type PromptAnswer =
  | { kind: "confirmation"; approved: boolean; reason?: string }
  | { kind: "question"; answer: string }

type OpenResult = { sessionId: string; events: AsyncGenerator<AgentStreamEvent> }

type Handlers = {
  /** Cumulative text for the turn currently streaming in. */
  onTextDelta: (text: string) => void
  /** A turn finished with non-empty text — commit it as its own message. */
  onTurnTextDone: (fullText: string) => void
  /** A tool call was resolved (automatically, or by the user) — for a visible activity line. */
  onToolActivity: (summary: string) => void
  /** A `user`-category tool call is pending — must resolve with the human's real answer. */
  onPromptUser: (prompt: PendingPrompt) => Promise<PromptAnswer>
  onError: (message: string) => void
}

function describeToolCall(name: string, args: Record<string, unknown>): string {
  if (name === "get_session_messages") {
    return `Looked up messages ${args.fromSequence ?? "?"}–${args.toSequence ?? "?"} from earlier in this session.`
  }
  return `Used tool: ${name}.`
}

/**
 * Drives one interaction to completion, including the tool-use loop: ASK mode only ever offers
 * `backend` (auto-resolved server-side) and `user` (must pause and ask the real human) tools, so
 * there's no client-executed file/process work to run here — just relay or prompt.
 */
export async function runAgentTurn(
  open: () => Promise<OpenResult>,
  continueWithToolResults: (sessionId: string, toolResults: ToolResultInput[]) => Promise<OpenResult>,
  handlers: Handlers,
): Promise<string> {
  let current = await open()
  const sessionId = current.sessionId

  while (true) {
    let textBuffer = ""
    const toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[] = []
    let stopReason: string | undefined

    for await (const event of current.events) {
      if (event.type === "text_delta") {
        textBuffer += event.text
        handlers.onTextDelta(textBuffer)
      } else if (event.type === "tool_call") {
        toolCalls.push({ id: event.id, name: event.name, arguments: event.arguments })
      } else if (event.type === "error") {
        handlers.onError(event.message)
      } else if (event.type === "done") {
        stopReason = event.stopReason
      }
    }

    if (textBuffer) {
      handlers.onTurnTextDone(textBuffer)
    }

    if (stopReason !== "TOOL_USE" || toolCalls.length === 0) {
      break
    }

    const toolResults: ToolResultInput[] = []

    for (const call of toolCalls) {
      if (call.name === "get_session_messages") {
        handlers.onToolActivity(describeToolCall(call.name, call.arguments))
        toolResults.push({ toolCallId: call.id, name: call.name, category: "backend", content: "", isError: false })
        continue
      }

      if (call.name === "request_confirmation") {
        const prompt = typeof call.arguments.prompt === "string" ? call.arguments.prompt : "Proceed?"
        const detail = typeof call.arguments.detail === "string" ? call.arguments.detail : undefined
        const answer = await handlers.onPromptUser({ kind: "confirmation", toolCallId: call.id, toolName: call.name, prompt, detail })
        const approved = answer.kind === "confirmation" && answer.approved
        const reason = answer.kind === "confirmation" ? answer.reason : undefined
        const content = approved ? "approved" : `declined${reason ? `: ${reason}` : ""}`
        handlers.onToolActivity(`Asked: "${prompt}" → ${approved ? "approved" : "declined"}`)
        toolResults.push({ toolCallId: call.id, name: call.name, category: "user", content, isError: false })
        continue
      }

      if (call.name === "ask_user") {
        const question = typeof call.arguments.question === "string" ? call.arguments.question : ""
        const options = Array.isArray(call.arguments.options) ? call.arguments.options.map(String) : undefined
        const answer = await handlers.onPromptUser({ kind: "question", toolCallId: call.id, toolName: call.name, question, options })
        const content = answer.kind === "question" ? answer.answer : ""
        handlers.onToolActivity(`Asked: "${question}" → ${content}`)
        toolResults.push({ toolCallId: call.id, name: call.name, category: "user", content, isError: false })
        continue
      }

      // Unknown tool name — shouldn't happen given ASK mode's fixed tool set, but fail the call
      // rather than silently dropping it so the interaction doesn't hang forever.
      toolResults.push({
        toolCallId: call.id,
        name: call.name,
        category: "backend",
        content: `Unsupported tool "${call.name}" in this client.`,
        isError: true,
      })
    }

    current = await continueWithToolResults(sessionId, toolResults)
  }

  return sessionId
}
