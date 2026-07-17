# Plan: implement `continueSession` (POST /api/v1/agent-session/:sessionId/interactions)

## Context

`startSession` is now fully implemented and committed (`ba7f91f`, `52d4bb3`) — it creates an `AgentSession`, its first `AgentInteraction`, seeds the first `AgentMessage`, streams one turn over SSE, and persists the outcome. `continueSession` (`apps/api/src/controller/agent-session.controller.ts:196`) is still a stub. This plan implements it: every message *after* the first one in a session goes through this route.

Per the user's description, the route has to resolve two different situations from one request shape:

1. **The CLI is answering pending tool calls.** The last turn ended with `stopReason: "TOOL_USE"`, so the interaction is still `RUNNING`. The request carries `toolResults`. → append the tool results to the **same** interaction and run another turn on it.
2. **The CLI is sending a fresh message.** The previous interaction is already closed (`COMPLETED`/`ERROR`/`CANCELLED`). The request carries `message`. → start a **new** `AgentInteraction` (next `sequence` in the session) and run its first turn, the same way `startSession` did for interaction 1.

Both branches end the same way `startSession` does: stream the provider's response over SSE while collecting it in local variables, then persist the turn + assistant message(s) + interaction/session update in one batched transaction. Since this tail is now needed in two routes, this plan extracts it into one shared private function in the same controller file and refactors `startSession` to call it too, instead of duplicating the ~60-line block. This keeps both routes byte-for-byt identical in how they stream and persist, which is the "persist everything as before" requirement.

**Decisions made while planning (stated here since they're judgment calls, not asked as separate questions):**

- If a request arrives with only `message` while the latest interaction is still `RUNNING` (i.e. the CLI skipped answering the pending tool calls), the route rejects it with a `ConflictError` rather than silently abandoning the pending turn — the CLI must resolve the tool calls first via `toolResults`.
- If `toolResults` are sent but the latest interaction is **not** `RUNNING`, that's also a `ConflictError` — there's nothing pending to answer.
- Continuing a session whose `AgentSession.status` is not `ACTIVE` (i.e. `ARCHIVED`) is rejected with a `ConflictError` too.
- The provider is stateless per request, so every turn — including continuations — must resend the **full** conversation history. This route hydrates it from the DB (`AgentMessage` rows for the session, ordered by `sequence`) rather than trying to keep it in memory across requests.

## Files to change

### 1. `packages/protocol/src/agent-session.ts`

Add the request schema for this route, next to `StartSessionSchema`:

```ts
import { ToolCategorySchema } from "./tool-registry.js" // already exported from @workspace/protocol's barrel

export const ContinueSessionToolResultSchema = z.object({
    toolCallId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    category: ToolCategorySchema, // "file" | "process" | "git" | "backend" | "user"
    // required for CLI-executed tools (file/process/git/user); omitted for "backend" -
    // the route executes those itself and fills in content from the execution result
    content: z.string().trim().min(1).max(900_000).optional(),
    isError: z.boolean().optional(),
})

export const ContinueSessionSchema = z.object({
    credentialLabel: z.string().trim().min(1).max(120),
    message: z.string().trim().min(1).max(900_000).optional(),
    toolResults: z.array(ContinueSessionToolResultSchema).min(1).optional(),
    mode: AgentCallModeSchema.default("AUTO"),
    thinkingLevel: z.enum(["INSTANT", "MID", "HIGH"]).default("MID"),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().max(1_000_000).optional(),
}).refine((data) => Boolean(data.message) || Boolean(data.toolResults), {
    message: "Either message or toolResults must be provided.",
})

export const SessionIdParamsSchema = z.object({
    sessionId: z.uuid(),
})
```

`mode`/`thinkingLevel` only matter when this call ends up starting a *new* interaction (branch 2 below) — they're unused, but harmless, in the tool-result branch.

### 2. `apps/api/src/controller/agent-session.controller.ts`

Two changes: extract the shared turn-execution tail out of `startSession` into a private function, and implement `continueSession` on top of it.

**a) Extract `runTurn` (private function, same file, next to the existing `sendEvent` helper):**

```ts
async function runTurn(params: {
    request: Request
    response: Response
    apiKey: string
    providerId: string
    modelId: string
    systemPrompt: string
    messages: ProviderMessage[]
    sessionId: string
    interactionId: string
    turnSequence: number
    nextMessageSequence: number
    temperature?: number
    maxOutputTokens?: number
}): Promise<void> {
    const { request, response, sessionId, interactionId, turnSequence } = params;

    // everything below streams to the client, so open the SSE response now
    response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    });

    // cancel the provider call if the client disconnects mid-stream
    const abortController = new AbortController();
    request.on("close", () => abortController.abort());

    // local variables that collect the stream as it comes in - nothing is written
    // to the database until the stream is fully finished
    let textBuffer = "";
    const toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[] = [];
    let usageInfo: { inputTokens: number; outputTokens: number; cachedTokens: number; reasoningTokens?: number } | undefined;
    let errorInfo: { code: string; message: string } | undefined;
    let stopReason: StopReason | undefined;
    let responseId: string | undefined;

    const stream = providerRegistry.stream(
        params.providerId,
        {
            modelId: params.modelId,
            messages: params.messages,
            systemPrompt: params.systemPrompt,
            tools: toolRegistry.getProviderTools(),
            temperature: params.temperature,
            maxOutputTokens: params.maxOutputTokens,
        },
        { apiKey: params.apiKey },
        abortController.signal,
    );

    for await (const event of stream) {
        sendEvent(response, event);
        if (event.type === "text_delta") textBuffer += event.text;
        else if (event.type === "tool_call") toolCalls.push({ id: event.id, name: event.name, arguments: event.arguments });
        else if (event.type === "usage") usageInfo = event;
        else if (event.type === "error") errorInfo = { code: event.code, message: event.message };
        else if (event.type === "done") { stopReason = event.stopReason; responseId = event.responseId; }
    }

    const interactionStatus = errorInfo ? "ERROR" : stopReason === "TOOL_USE" ? "RUNNING" : "COMPLETED";

    await prisma.$transaction(async (tx) => {
        const turn = await tx.agentTurn.create({
            data: {
                sessionId, interactionId, sequence: turnSequence, responseId, stopReason,
                inputTokens: usageInfo?.inputTokens ?? 0,
                outputTokens: usageInfo?.outputTokens ?? 0,
                cachedTokens: usageInfo?.cachedTokens ?? 0,
                reasoningTokens: usageInfo?.reasoningTokens ?? 0,
            },
        });

        let nextSequence = params.nextMessageSequence;

        if (textBuffer) {
            await tx.agentMessage.create({
                data: { sessionId, interactionId, turnId: turn.id, sequence: nextSequence++, role: "ASSISTANT", content: textBuffer, isError: errorInfo ? true : undefined },
            });
        }
        if (toolCalls.length > 0) {
            await tx.agentMessage.create({
                data: { sessionId, interactionId, turnId: turn.id, sequence: nextSequence++, role: "ASSISTANT", toolCalls: toolCalls as Prisma.InputJsonValue, isError: errorInfo ? true : undefined },
            });
        }

        await tx.agentInteraction.update({
            where: { id: interactionId },
            data: { status: interactionStatus, completedAt: interactionStatus === "RUNNING" ? undefined : new Date(), inputTokens: usageInfo?.inputTokens, outputTokens: usageInfo?.outputTokens },
        });
        await tx.agentSession.update({ where: { id: sessionId }, data: { lastMessageAt: new Date() } });
    });

    response.end();
}
```

**b) Refactor `startSession`** to build its `messages: ProviderMessage[]` and system prompt as before, then call `await runTurn({ request, response, apiKey, providerId: input.providerId, modelId: input.modelId, systemPrompt: SYSTEM_PROMPTS[input.mode] + (input.systemPrompt ?? ""), messages: [{ role: "user", content: input.message }], sessionId: session.id, interactionId: interaction.id, turnSequence: 1, nextMessageSequence: 2, temperature: input.temperature, maxOutputTokens: input.maxOutputTokens })` and `return response;` right after. Nothing else about `startSession` changes.

**c) Implement `continueSession`:**

```ts
continueSession = async (request: Request, response: Response): Promise<Response> => {
    const userId = requireUserId(request);
    const { sessionId } = validate(SessionIdParamsSchema, request.params);
    const input = validate(ContinueSessionSchema, request.body);

    const session = await prisma.agentSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundError("Session not found.");
    if (session.status !== "ACTIVE") throw new ConflictError("This session is archived and cannot be continued.");

    // a session can in principle have zero interactions (e.g. one somehow created
    // without a first message) - treat that the same as "the last interaction is
    // closed", not as an error on its own; only the branches below decide if it's
    // actually invalid, based on what the request body is asking for
    const latestInteraction = await prisma.agentInteraction.findFirst({
        where: { sessionId }, orderBy: { sequence: "desc" },
    });

    const credential = await prisma.providerCredential.findFirst({
        where: { userId, providerId: session.providerId, label: input.credentialLabel },
    });
    if (!credential) throw new NotFoundError("No credential found for this provider and label.");

    // sequence numbers are session-wide for messages, per-interaction for turns -
    // work out where each counter currently stands before writing anything
    const lastMessage = await prisma.agentMessage.findFirst({ where: { sessionId }, orderBy: { sequence: "desc" } });
    let nextMessageSequence = (lastMessage?.sequence ?? 0) + 1;

    // declared without an initial value on purpose - each branch below is
    // responsible for assigning a concrete interaction to continue or use
    let interaction: NonNullable<typeof latestInteraction>;
    let turnSequence: number;

    if (input.toolResults) {
        // branch 1: answering pending tool calls - there must be an open interaction
        // to answer. No interaction at all is the same failure as a closed one.
        if (!latestInteraction || latestInteraction.status !== "RUNNING") {
            throw new ConflictError("This session has no pending tool calls to answer.");
        }
        interaction = latestInteraction;
        const lastTurn = await prisma.agentTurn.findFirst({ where: { interactionId: interaction.id }, orderBy: { sequence: "desc" } });
        turnSequence = (lastTurn?.sequence ?? 0) + 1;

        // the assistant message that ended the previous turn carries the original
        // tool_call arguments - needed to actually execute a "backend" tool below
        const toolCallMessages = await prisma.agentMessage.findMany({
            where: { interactionId: interaction.id, turnId: lastTurn?.id, role: "ASSISTANT" },
        });
        const toolCallArguments = toolCallMessages
            .flatMap((message) => (message.toolCalls as ProviderToolCall[] | null) ?? [])
            .reduce<Record<string, Record<string, unknown>>>((byId, call) => {
                byId[call.id] = call.arguments;
                return byId;
            }, {});

        // "backend" tools are executed by the API itself, not the CLI - everything
        // else (file/process/git/user) was already run locally, so its content is
        // trusted as-is. A failed or unavailable backend tool becomes a normal
        // isError result, never a thrown exception - the interaction must not crash.
        const resolvedToolResults = await Promise.all(input.toolResults.map(async (result) => {
            if (result.category !== "backend") {
                return result;
            }
            try {
                const tool = toolRegistry.get(result.name); // throws ToolNotRegisteredError if unknown
                const args = toolCallArguments[result.toolCallId];
                if (!args) {
                    throw new Error("No matching pending tool call found for this result.");
                }
                // NOTE: ToolDefinition has no execution capability yet (tool-registry
                // is still a stub) - check the current ToolRegistry/ToolDefinition shape
                // at implementation time for the real execute call; whatever it turns
                // out to be, keep it inside this try block.
                const output = await tool.execute(args);
                return { ...result, content: String(output), isError: false };
            } catch (error) {
                return {
                    ...result,
                    content: error instanceof Error ? error.message : "Backend tool execution failed.",
                    isError: true,
                };
            }
        }));

        await prisma.$transaction(
            resolvedToolResults.map((result) =>
                prisma.agentMessage.create({
                    data: {
                        sessionId, interactionId: interaction.id, sequence: nextMessageSequence++,
                        role: "TOOL", toolCallId: result.toolCallId, name: result.name,
                        content: result.content ?? "", isError: result.isError,
                    },
                }),
            ),
        );
    } else {
        // branch 2: fresh message - fine whether the previous interaction is closed
        // OR there was never one at all; only an open (RUNNING) interaction blocks this
        if (latestInteraction?.status === "RUNNING") {
            throw new ConflictError("This session is waiting on tool results - send toolResults instead of message.");
        }
        interaction = await prisma.agentInteraction.create({
            data: {
                sessionId, sequence: (latestInteraction?.sequence ?? 0) + 1,
                providerId: session.providerId, modelId: session.modelId,
                mode: input.mode, thinkingLevel: input.thinkingLevel,
                temperature: input.temperature, maxOutputTokens: input.maxOutputTokens,
                credentialId: credential.id,
            },
        });
        await prisma.agentMessage.create({
            data: { sessionId, interactionId: interaction.id, sequence: nextMessageSequence++, role: "USER", content: input.message! },
        });
        turnSequence = 1;
    }

    // hydrate the full conversation so far - the provider is stateless, so every
    // turn (including this one) resends the whole history, not just the new part
    const rows = await prisma.agentMessage.findMany({ where: { sessionId }, orderBy: { sequence: "asc" } });
    const messages: ProviderMessage[] = rows.map((row) => {
        if (row.role === "USER") return { role: "user", content: row.content ?? "" };
        if (row.role === "TOOL") return { role: "tool", toolCallId: row.toolCallId!, name: row.name!, content: row.content ?? "", isError: row.isError ?? undefined };
        if (row.role === "SYSTEM") return { role: "system", content: row.content ?? "" };
        return { role: "assistant", content: row.content ?? undefined, toolCalls: (row.toolCalls as ProviderToolCall[]) ?? undefined };
    });

    const apiKey = decryptCredential(credential, { userId, providerId: session.providerId, label: input.credentialLabel });

    await runTurn({
        request, response, apiKey,
        providerId: session.providerId, modelId: session.modelId,
        systemPrompt: SYSTEM_PROMPTS[interaction.mode] + (session.systemPrompt ?? ""),
        messages,
        sessionId: session.id, interactionId: interaction.id,
        turnSequence, nextMessageSequence,
        temperature: interaction.temperature ?? undefined, maxOutputTokens: interaction.maxOutputTokens ?? undefined,
    });

    return response;
}
```

New imports needed in the controller: `ConflictError` from `../utils/api-error.js`, `ContinueSessionSchema`, `SessionIdParamsSchema`, `type ProviderToolCall` from `@workspace/protocol` (`toolRegistry` is already imported from `../utils/environment.js` for `startSession`).

## What stays untouched

- `listSessions` remains a stub — not part of this task.
- `file`/`process`/`git`/`user` category tool results are still trusted as-is from the CLI, unchanged — only `backend` category results are executed server-side.
- Still only `providerId: "google"` works end-to-end (`AnthropicProvider`/`OpenaiProvider` remain stubs) and `ToolRegistry.getProviderTools()` still returns `[]`, so `stopReason: "TOOL_USE"` won't occur in practice yet — the branch is implemented so the contract is complete once those land, not because it's exercised today.
- **Real gap to flag during implementation:** `ToolDefinition` (in `packages/tool-registry`) has no execution method yet — it's currently just `{name, category}`. The `tool.execute(args)` call in the plan above is the intended shape, but the actual current API must be checked against `packages/tool-registry/src/registry.ts` / `types.ts` when this is implemented, since that package has been evolving mid-session. Until it has real execution, every `backend`-category tool result will resolve through the `catch` branch with `isError: true` — which is correct, safe behavior, not a bug.

## Verification

1. `tsc --noEmit` in `apps/api` and `packages/protocol` after the edits.
2. Start a session via `startSession` (as already verified), then `POST /api/v1/agent-session/:sessionId/interactions` with `{"credentialLabel":"default","message":"..."}` — confirm a new `AgentInteraction` (`sequence: 2`) and its turn/messages are created, and the session's `lastMessageAt` moves forward.
3. Send `toolResults` against a session whose latest interaction is `RUNNING` (may require temporarily forcing an interaction into `RUNNING` via Prisma Studio, since no live tool-use path exists yet) — confirm the `TOOL` message rows land on the *same* `interactionId` with an incremented `AgentTurn.sequence`, not a new interaction.
4. Send `message` against a session whose latest interaction is `RUNNING` — expect a 409 `ConflictError`. Send `toolResults` against a session whose latest interaction is already `COMPLETED` — expect a 409 too.
5. Confirm the hydrated `messages` sent to the provider include the full prior history (check via a temporary log or by inspecting what `providerRegistry.stream` receives) — not just the newest message.
6. Edge case: a session with zero `AgentInteraction` rows (delete the row via Prisma Studio after `startSession` creates it, or test against a hand-inserted session). `POST .../interactions` with `message` should succeed and create interaction `sequence: 1`; the same call with `toolResults` should 409, not 404.
7. Send a `toolResults` entry with `category: "backend"` for a `name` that isn't registered in `toolRegistry` — confirm the request still succeeds (no crash, no 500), the resulting `AgentMessage` row has `isError: true`, and its `content` holds the error text rather than being empty.
