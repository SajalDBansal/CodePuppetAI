# Agent session flow audit — user creation → key storage → OpenAI session

**Date:** 2026-08-13 (original audit), updated after a first remediation pass, updated again after a second pass, updated again after a third pass, **updated again after a fourth remediation pass** — all same day.
**Scope:** Live, end-to-end run of the flow: sign-up → store an OpenAI API key → start an agent session → stream a turn → resolve a tool call → answer it. Findings below come from actually exercising the running API against Postgres and the real OpenAI API using the key pasted into `apps/api/.env`, across all five passes (original + four remediation passes). This pass also adds a **new, forward-looking design section** (not a bug report) on where to add context-window compaction — see the bottom of this document.

## TL;DR

- The key you pasted into `apps/api/.env` is **never read by any code** — nothing does anything with it. Credentials only come from the encrypted `ProviderCredential` table, saved through `POST /api/v1/credentials`. That's finding #4 below and is almost certainly what you were expecting to "just work." **Still true — unchanged, informational only.**
- The flow now works cleanly end-to-end: all four models stream correctly, tool calls round-trip correctly, the category-execution exploit stays blocked, `thinkingLevel` reaches the provider and no longer crashes on any model, credential `lastUsedAt` updates, token usage aggregates correctly onto each `AgentInteraction`, and `startSession` now validates `providerId`/`modelId` against the catalog and clamps `maxOutputTokens`.
- Only **three** genuinely open gaps remain (down from four): no provider-error classification (#3), the session-history endpoint is stuck mid-refactor (#5, got a route/schema but no handler), and no CLI-side tool execution (#12) — plus `AnthropicProvider` is still a complete stub. Finding #9 (catalog enforcement) is now mostly closed; only cost computation is left.
- **New this pass:** a full design writeup for context-window compaction — where the 70%-threshold check belongs, where the compaction function should live, and how `runTurn` should read compacted + non-compacted history. See **"Compaction design"** near the end of this document. No code was written for it, per your request — this is a plan only.

## Remediation status (as of this update — fourth pass)

Since the third pass: `startSession` gained catalog validation (`modelId`/`providerId` existence check + `maxOutputTokens` clamp), and the `GET /api/v1/agent-session` route changed shape (`/` → `/:sessionId`) with a new (still-unused) `ListSessionHistoryParamsSchema`, without the handler being updated to match. Re-tested every finding live again. Status:

| # | Finding | Status |
|---|---|---|
| 1 | **[CRITICAL]** Tool `category` trust bug → arbitrary server-side tool execution | ✅ Fixed, re-verified live again this pass |
| 2 | **[HIGH]** Default/codex OpenAI models broken on Chat Completions | ✅ Fixed, re-verified live again this pass |
| 3 | **[HIGH]** Provider errors always collapse to `"unknown"` | ❌ Still open, unchanged |
| 4 | **[MEDIUM]** `.env`'s `OPENAI_API_KEY` is dead | — Not a code bug; unchanged (informational) |
| 5 | **[MEDIUM]** `listSessions` is a stub | ❌ **Still open** — now with a route (`/:sessionId`) and a schema (`ListSessionHistoryParamsSchema`) pointing at a "fetch one session" endpoint, but the handler still just returns `{}` regardless of the ID given. Re-verified live. |
| 6 | **[MEDIUM]** `thinkingLevel` never reaches any provider | ✅ Fixed, confirmed unchanged since pass 2 |
| 7 | **[LOW]** System-prompt concatenation has no separator | ✅ Fixed, confirmed unchanged since pass 1 |
| 8 | **[LOW]** `lastUsedAt` never written | ✅ Fixed, confirmed unchanged since pass 2 |
| 9 | **[LOW]** Catalog cost data unused, no cost/limit enforcement | 🟡 **Half-fixed this pass** — `startSession` now validates `modelId`/`providerId` against the catalog and clamps `maxOutputTokens` (both re-verified live: 404 for an unknown model, 409 for an over-cap `maxOutputTokens`). `continueSession`'s fresh-message branch doesn't clamp `maxOutputTokens` yet, and no cost-in-dollars is ever computed from `ModelCatalog.inputCostPer1M`/`outputCostPer1M`. |
| 10 | **[LOW]** Dead `CLI_CLIENT_ID` constant | ✅ Fixed, confirmed unchanged since pass 3 |
| 11 | Unregistered-provider SSE-after-headers-sent crash | ✅ Fixed, confirmed unchanged since pass 1 |
| 12 | No CLI-side tool execution | ❌ Still open, unchanged (`apps/cli` untouched) |
| 13 | `continueSession` read `mode`/`thinkingLevel` from the request instead of the interaction | ✅ Fixed, confirmed unchanged since pass 3 |
| 14 | `thinkingLevel: "INSTANT"` crashed every turn against `gpt-5.5-pro` | ✅ Fixed, confirmed unchanged since pass 3 |
| — | `AnthropicProvider` is a full stub | ❌ Still open — the single most visible remaining gap |

**Net: 11 of 14 numbered findings are now fully fixed, 1 is half-fixed (#9), and 3 remain genuinely open (#3, #5, #12)**, plus the `AnthropicProvider` stub. All re-verified live this pass except where noted. Concrete next steps are at the bottom of this document, followed by the new compaction design section.

Full detail for every finding, including what changed and how it was re-verified across all passes, is below. Original write-ups are kept intact with **Status update** notes appended under each one, in chronological order.

## Method (original pass)

1. Confirmed Postgres (`infra-db-1` container) was up and migrations applied (`prisma migrate status` → up to date).
2. Started the API with `bun --env-file=../../packages/database/.env --env-file=.env ./src/index.ts`.
3. Signed up a brand-new user via `POST /api/v1/auth/sign-up/email` (better-auth, email/password).
4. Saved the pasted OpenAI key via `POST /api/v1/credentials` (`providerId: "openai"`, `label: "default"`) using the new user's bearer token.
5. Called `POST /api/v1/agent-session` against each of the four catalog-seeded OpenAI models, and exercised the tool-call round trip via `POST /api/v1/agent-session/:id/interactions`.
6. Read the relevant source for every unexpected response to find the root cause.
7. Stopped the test server when done.

## Method (remediation re-check)

1. Re-read every changed file (`git status` showed: `agent-session.controller.ts`, `auth.ts`, `protocol/agent-session.ts`, `protocol/provider-registry.ts`, `protocol/tool-registry.ts`, `provider-registry/providers/{openai,google}.ts`, `tool-registry/{package.json,src/index.ts,src/registry.ts,tsconfig.json}`).
2. `bun run typecheck` in `protocol`, `tool-registry`, `provider-registry`, `database`, and `apps/api` — all clean.
3. Restarted the API server, reused the same test user/credential from the original pass (still valid — bearer tokens last 30 days).
4. Re-ran `gpt-5.5-pro` (the previously-broken default) through the full HTTP/SSE stack — now works.
5. Re-ran the exact category-mislabeling exploit from finding #1 (claim `"category": "backend"` for the `bash` tool, which is registered as `"process"`) — the shell command is no longer executed; the model just responds without real tool output.
6. Confirmed `lastUsedAt` is still `null` after active use.
7. Code-reviewed the `thinkingLevel` wiring end-to-end (protocol type → controller → `providerRegistry.stream()` call → adapters) to check whether the value set by a caller actually reaches OpenAI/Google.
8. Stopped the test server when done.

---

## Findings

### 1. [CRITICAL] `continueSession` trusts the client's claimed tool `category`, not the tool's actual registered category — lets any user get the server to execute arbitrary tools

> **Status update (2026-08-13): ✅ Fixed, re-verified live.** `agent-session.controller.ts` now does `const tool = toolRegistry.get(result.name); if (tool.category !== "backend") { return result; }` — i.e. it checks the tool's *actual registered* category, not `result.category` from the request body. I re-ran the exact exploit from the original write-up below (mislabel the `bash` tool, which is registered as `"process"`, as `"category": "backend"` in the tool-result payload): the server no longer executes the shell command — the model receives no real tool output and just replies "Done." based on nothing. One small nit: the fix calls `toolRegistry.get(result.name)` a second time, redundantly, inside the `try` block right after — harmless (shadows the outer `tool` variable with an identical lookup), but worth a quick cleanup pass. No other action needed on this finding.

**Where:** `apps/api/src/controller/agent-session.controller.ts:292` (original)

```ts
const resolvedToolResults = await Promise.all(input.toolResults.map(async (result) => {
    if (result.category !== "backend") {
        return result;
    }
    ...
    const output = await tool.execute(args);
```

The design (per the existing code comments) is: `"backend"`-category tools are executed by the API server itself; `"file"`/`"process"`/`"git"`/`"user"` tools are executed by the CLI locally and their results are just trusted as-is. But the branch above only looks at `result.category` **as sent in the request body** — it never checks `toolRegistry.get(result.name).category`, i.e. what the tool is actually registered as.

**Reproduced live:** I registered/added a basic `bash` tool during the previous task, under `category: "process"` (meant to be CLI-executed only, per convention). I then:

1. Started a session and prompted the model to call `bash` with a shell command.
2. Answered the resulting tool call via `POST /api/v1/agent-session/:id/interactions` with `"category": "backend"` (a lie — the tool is registered as `"process"`).
3. The server actually ran the shell command locally via `child_process.exec` and returned its real output, which the model then relayed back to me.

Any authenticated user — using nothing but their own valid session and their own stored provider credential — can therefore make the API host execute **any registered tool** server-side, no matter what category it's meant to run under, just by mislabeling `category` in the tool-result payload. Combined with the fact that the `bash` tool (`packages/tool-registry/src/tools/process.ts`) has no allowlist, no sandbox, and only a 10-second timeout, this is close to remote code execution on the API host for anyone with an account.

**Fix (now applied):** Never trust `result.category` from the request for execution decisions. Look up the tool in `toolRegistry` and use *its* registered `category`. Longer term, the `bash` tool (or any future `"backend"` tool) still has no allowlist/sandbox/resource limits beyond a 10-second timeout — it needs one (e.g. the `E2B_*` env vars already stubbed out in `.env` suggest a sandbox was planned) before it's safe to expose to real users, even with the category check fixed.

---

### 2. [HIGH] The seeded default OpenAI model is broken; one other seeded model is also broken

> **Status update (2026-08-13): ✅ Fixed, re-verified live.** `OpenaiProvider` was rewritten to use `client.responses.stream(...)` instead of Chat Completions. I re-ran all four seeded models through the new code, both as a direct provider-level smoke test and through the full HTTP/SSE stack — every model now streams text correctly, and a full tool-call round trip (propose → answer → follow-up) works for the ones tested. `gpt-5.5-pro` (the catalog default) additionally reports real `reasoningTokens` now, since it's a genuine reasoning-tier model that only exposes that under the Responses API. Per your explicit call, the catalog itself (`packages/database/src/catalog.ts`) was intentionally left unchanged — all four existing model IDs are correct and working as-is, no swap needed.

`OpenaiProvider` (`packages/provider-registry/src/providers/openai.ts`) only implements the **Chat Completions** API (`client.chat.completions.create`). Tested all four models seeded in `packages/database/src/catalog.ts` against the real OpenAI API with the pasted key:

| modelId | seeded as | result (original, Chat Completions) | result (after fix, Responses API) |
|---|---|---|---|
| `gpt-5.5-pro` | **`isDefault: true`** | ❌ `404 This is not a chat model...` | ✅ works |
| `gpt-5.5` | | ✅ works | ✅ works |
| `gpt-5.4` | | ✅ works | ✅ works |
| `gpt-5.3-codex` | | ❌ `404 ...Use the v1/responses endpoint instead.` | ✅ works |

**Fix (now applied):** `OpenaiProvider` routes through `client.responses.stream(...)`. Messages are built into `ResponseInputItem[]` (user/assistant text as `EasyInputMessage`, assistant tool calls as `function_call` items, tool results as `function_call_output` items), system prompt via the dedicated `instructions` field, tools as `FunctionTool[]`. Streaming reads `response.output_text.delta` for text, then `stream.finalResponse()` for tool calls, usage, and stop reason.

---

### 3. [HIGH] Provider errors are never classified — everything collapses to `"unknown"`, non-retryable

> **Status update (2026-08-13): ❌ Still open, unchanged.** `packages/provider-registry/src/error.ts` is byte-for-byte the same as the original audit — the entire status/code mapping is still commented out. Not addressed by the Responses API switch (which fixed the specific 404s in finding #2, but any *other* real-world failure — bad key, rate limit, 5xx — still comes back generically). Still the next-most-impactful fix after this pass, see "What to do next."

**Where:** `packages/provider-registry/src/error.ts:50` onward — the entire status/code-based mapping (401→`authentication_failed`, 429→`rate_limited` + retryable, 404→`model_not_found`, 5xx→`provider_unavailable` + retryable, etc.) is **commented out**. `toProviderError` unconditionally falls through to:

```ts
return new ProviderError(providerId, "unknown", false, getErrorMessage(error));
```

I confirmed the OpenAI SDK errors do carry exactly what the commented-out code expects — probed a real 401 (bad key) and got `error.status === 401`, `error.code === "invalid_api_key"`. The mapping logic would work correctly if uncommented; it's just dead code right now.

**Observed effect:** the 404 "not a chat model" error from finding #2 (now fixed) reached the client as `"code":"unknown","retryable":false"` — a client has no way to tell "bad model" apart from "bad key" apart from "rate limited" apart from "OpenAI is down." Every one of these currently marks the whole `AgentInteraction` as `status: "ERROR"`, including cases (rate limits, 5xx) that should be retryable and shouldn't necessarily kill the interaction.

**Fix:** Uncomment/finish the mapping in `toProviderError`, using `error.status`/`error.code` (all three SDKs — OpenAI, Anthropic, `@google/genai` — expose these, though the exact property names should be double-checked per SDK before uncommenting blindly).

---

### 4. [MEDIUM] `apps/api/.env`'s `OPENAI_API_KEY` is dead — nothing reads it

> **Status update (2026-08-13): Unchanged, as expected.** This isn't a code defect to "fix" so much as a local `.env` file to clean up — still present, still unused. No action taken since it's not something the code changes address.

Confirmed via `grep -rn "OPENAI_API_KEY"` across `apps/` and `packages/`: zero matches outside `.env` itself. It isn't in `EnvironmentSchema` (`apps/api/src/utils/environment.ts`) and no provider adapter reads `process.env` at all — `OpenaiProvider`/`AnthropicProvider`/`GoogleProvider` all take their key from `ProviderCredentials.apiKey`, which comes from decrypting a `ProviderCredential` DB row.

This is almost certainly the actual root cause of "why isn't my key working" — pasting a key into `.env` has **no effect whatsoever** on the running app. The only way to make a key usable is:

```
POST /api/v1/credentials
{ "providerId": "openai", "label": "<any label>", "apiKey": "<key>" }
```

as an authenticated user, which encrypts and stores it per-user in `ProviderCredential`, then reference that `label` as `credentialLabel` when starting a session.

**Fix:** either remove the stray `OPENAI_API_KEY` line from `.env` (to avoid the false impression that it does something), or — if the intent is to support a "server-wide fallback key" model — that would need to be a deliberate, separate feature (env-schema entry + explicit fallback logic in the credential-resolution path), not something to rely on today.

---

### 5. [MEDIUM] `GET /api/v1/agent-session` (`listSessions`) is a stub — always returns `{}`

> **Status update (fourth pass, 2026-08-13): ❌ Still open — the handler is unchanged, but the route around it moved, and now the two disagree with each other.** `apps/api/src/router/agent-session.route.ts` changed from `agentSessionRouter.get("/", ...)` to `agentSessionRouter.get("/:sessionId", ...)`, and `packages/protocol/src/agent-session.ts` gained a new `ListSessionHistoryParamsSchema = z.object({ sessionId: z.string().trim().min(1).max(120).optional() })` — both clearly aimed at turning this into a "fetch one session's history" endpoint rather than "list all of a user's sessions" (a `:sessionId` path param only makes sense for the former). But `listSessions` itself is still exactly `return response.status(200).json({})` — it never reads `request.params.sessionId`, never validates against the new schema, never queries the database. Re-verified live: `GET /api/v1/agent-session/<any-uuid>` still returns `{}` regardless of what ID is passed, including IDs that don't exist at all. So this finding got slightly worse in shape, not better: there's now a route and a schema that both imply a real endpoint is coming, but the handler hasn't caught up, and the endpoint's own purpose is ambiguous mid-refactor (single-session fetch vs. list-all — the path shape says one thing, the method name (`listSessions`) still says the other).

**Where:** `apps/api/src/controller/agent-session.controller.ts:166` (handler), `apps/api/src/router/agent-session.route.ts:9` (route), `packages/protocol/src/agent-session.ts:45` (unused schema)

```ts
listSessions = async (request: Request, response: Response): Promise<Response> => {
    return response.status(200).json({})
}
```

It doesn't even hit the database. There is currently no way for any client (CLI or web) to enumerate a user's own sessions, and — now that the route takes a `:sessionId` — no way to fetch one session's full history either.

**Fix:** pick one direction and implement it fully, since the route/schema changes suggest the direction has already been decided (single-session fetch):
- If it's "fetch one session's history" (matches the current route shape): validate `request.params` against `ListSessionHistoryParamsSchema` (or promote it to require `sessionId`, since `.optional()` doesn't make sense for a required path param), look up the session scoped to `userId` (404 if not found/not owned), and return its messages/interactions/turns — this is also exactly the endpoint a client needs to call before resuming a session, e.g. to rebuild local UI state.
- If "list all of a user's sessions" is still wanted too, it needs its own route back (`GET /api/v1/agent-session/`, list-shaped, no `:sessionId`), separate from this one — right now that capability doesn't exist anywhere, path or otherwise.

---

### 6. [MEDIUM] `thinkingLevel` is accepted and stored, but never reaches any provider

> **Status update (second pass, 2026-08-13): ✅ Now fully fixed.** `ProviderTurnCall` gained a `thinkingLevel?: ThinkingLevel` field, `runTurn`'s `providerRegistry.stream(...)` call now includes `thinkingLevel: params.thinkingLevel`, and both `startSession` and `continueSession` now pass `thinkingLevel: input.thinkingLevel` into their `runTurn({...})` calls. I confirmed this is genuinely wired end-to-end (not just type-checking) by sending real requests with `thinkingLevel: "HIGH"` vs `"INSTANT"` — the value provably reaches OpenAI, because sending `"INSTANT"` (which maps to `reasoning.effort: "low"`) against `gpt-5.5-pro` now gets **rejected by the real API** with a 400 (`'low' is not supported with the 'gpt-5.5-pro' model`). An unwired/no-op field couldn't produce a model-specific validation error like that — this is conclusive proof the value is actually being sent. See finding #14 for the bug that error itself represents, and finding #13 (updated) for a remaining "wrong source in `continueSession`'s tool-result branch" issue that now also applies to this field, not just to `mode`.

**Status update (first pass, 2026-08-13, superseded above):** ~~Half-fixed — the protocol type and OpenAI/Google adapters were updated to read and map `thinkingLevel`, but the controller never actually set it on the request it built, so it was still a no-op end-to-end.~~ This has since been completed — see the second-pass note above.

`StartSessionSchema`/`ContinueSessionSchema` both validate and default `thinkingLevel` (`INSTANT`/`MID`/`HIGH`), and it's persisted on every `AgentInteraction` row. It now actually changes the model call: `OpenaiProvider` maps it to `reasoning.effort` (`"low"`/`"medium"`/`"high"`), `GoogleProvider` maps it to a `thinkingBudget` in tokens. `AnthropicProvider` is still a stub, so it doesn't read `thinkingLevel` at all yet.

---

### 7. [LOW] System-prompt concatenation has no separator

> **Status update (2026-08-13): ✅ Fixed.** Both call sites in `agent-session.controller.ts` now read `` `${SYSTEM_PROMPTS[mode]}\n\n${systemPrompt ?? ""}`.trim() `` — properly separated and trimmed. See finding #13 immediately below, though: fixing *this* surfaced a separate, sharper bug in the `continueSession` call site specifically.

**Where:** `apps/api/src/controller/agent-session.controller.ts:214` and `:381` (original)

```ts
systemPrompt: SYSTEM_PROMPTS[input.mode] + (input.systemPrompt ?? ""),
```

`SYSTEM_PROMPTS[mode]` ends with `.trim()` (no trailing newline). If a caller supplies a custom `systemPrompt`, it gets glued directly onto the last sentence of the built-in prompt with zero separation, e.g.:

```
...and any remaining unresolved issues.You are a pirate, respond only in pirate speak.
```

**Fix (now applied):** join with `"\n\n"` and re-trim.

---

### 13. [LOW/MEDIUM] `continueSession`'s tool-result branch reads `mode` and `thinkingLevel` from the request instead of the interaction — now two instances of the same bug

> **Status update (third pass, 2026-08-13): ✅ Fixed.** Both call sites now read from `interaction`:
> ```ts
> systemPrompt: `${SYSTEM_PROMPTS[interaction.mode]}\n\n${session.systemPrompt ?? ""}`.trim(),
> ...
> thinkingLevel: interaction.thinkingLevel
> ```
> Confirmed by direct code read of the current `continueSession`. No live behavioral test was needed beyond that — the fix is a straightforward source substitution and the diff is unambiguous.

> **Status update (second pass, 2026-08-13, superseded above): still open, and now applies to two fields instead of one.** Re-checked `agent-session.controller.ts` line-by-line: the `mode` instance described below is completely unchanged from the first pass. But finishing finding #6's `thinkingLevel` wiring added a **second occurrence of the identical mistake** at line 405: `thinkingLevel: input.thinkingLevel` inside `continueSession`'s call to `runTurn({...})` — it should be `interaction.thinkingLevel`, for exactly the same reason `mode` should be `interaction.mode`. Notably, the codebase already gets this right for `temperature`/`maxOutputTokens` in that same `runTurn({...})` call (`temperature: interaction.temperature ?? undefined`, `maxOutputTokens: interaction.maxOutputTokens ?? undefined` — correctly sourced from `interaction`, not `input`), so there's already a correct pattern sitting right next to both of the incorrect ones.

**Where:** `apps/api/src/controller/agent-session.controller.ts:397` (`systemPrompt`) and `:405` (`thinkingLevel`)

```ts
await runTurn({
    ...
    systemPrompt: `${SYSTEM_PROMPTS[input.mode]}\n\n${session.systemPrompt ?? ""}`.trim(),  // should read interaction.mode
    ...
    temperature: interaction.temperature ?? undefined,      // correctly reads from `interaction`
    maxOutputTokens: interaction.maxOutputTokens ?? undefined, // correctly reads from `interaction`
    thinkingLevel: input.thinkingLevel                       // should read interaction.thinkingLevel
});
```

Both lines are shared by both branches of `continueSession` (fresh message *and* answering pending tool results), but `input.mode`/`input.thinkingLevel` are the **incoming request's** fields — `ContinueSessionSchema` defaults `mode` to `"AUTO"` and `thinkingLevel` to `"MID"` when omitted. That's harmless in branch 2 (fresh message), because `interaction.mode`/`interaction.thinkingLevel` are *created from* `input.mode`/`input.thinkingLevel` a few lines earlier in that same branch, so they're always equal there. It's **wrong** in branch 1 (answering a pending tool call on an *existing* `RUNNING` interaction): that interaction already has its own `mode` and `thinkingLevel`, set whenever it was first started, with nothing to do with whatever happens to be in the current tool-results request body.

Concretely: **a session started in a restrictive mode like `ASK`/`PLAN`, or with `thinkingLevel: "HIGH"`, can silently have its system prompt and reasoning effort reset to `AUTO`/`"MID"` for every follow-up turn that answers a tool call**, purely because the client didn't bother resending `mode`/`thinkingLevel` on that specific request — which used to be correct, reasonable behavior (the pre-existing code comments, before any of this session's edits, explicitly said `mode`/`thinkingLevel` "don't matter" in that branch), back when neither field actually reached the provider. Now that both do, that assumption is no longer true, and this is the leftover.

**Not reproduced with a live behavioral difference** for `mode` (models don't reliably self-report which system prompt they're following). For `thinkingLevel`, a live difference *could* likely be shown (e.g. start an interaction on `gpt-5.5-pro` with `thinkingLevel: "HIGH"`, trigger a tool call, answer it without resending `thinkingLevel`, and check whether reasoning effort silently drops to `"medium"`) — not run in this pass, since the code trace is already unambiguous: `interaction` is in scope with the correct values at both lines, and `input.mode`/`input.thinkingLevel` differ from it whenever the request omits those fields, which is the common case for a tool-answer request.

**Fix:** use `interaction.mode` and `interaction.thinkingLevel` instead of `input.mode`/`input.thinkingLevel` at both call sites inside `continueSession`. (`startSession` doesn't have this problem — it has no prior interaction to compare against.)

---

### 8. [LOW] `ProviderCredential.lastUsedAt` is exposed but never written

> **Status update (second pass, 2026-08-13): ✅ Fixed, confirmed live.** `runTurn` now includes `await tx.providerCredential.update({ where: { id: params.credential.id }, data: { lastUsedAt: new Date() } })` inside its existing `$transaction` (so it only lands once the turn has actually completed and been persisted). To carry the credential's `id` down to that point, `ProviderTurnCall.apiKey: string` was replaced with `credential: { apiKey: string, id: string }`, and both `startSession`/`continueSession` now pass `credential: { apiKey, id: credential.id }` instead of just `apiKey`. I re-verified live: called `GET /api/v1/credentials` immediately before and after running a turn on the same credential — `lastUsedAt` went from `null` to a real timestamp (`2026-08-13T12:40:31.102Z`) right after the turn finished.

`credential.controller.ts` selects and returns `lastUsedAt` in every response; it now reflects real usage.

---

### 9. [LOW] Catalog data (context window, max output tokens, cost) is seeded but never enforced or used

> **Status update (fourth pass, 2026-08-13): 🟡 Half-fixed — catalog validation landed, cost computation didn't.** `startSession` now does exactly what this finding asked for on the validation side:
> ```ts
> const [provider, model] = await Promise.all([
>     prisma.providerCatalog.findFirst({ where: { providerId: input.providerId }, select: { displayName: true } }),
>     prisma.modelCatalog.findFirst({
>         where: { providerId: input.providerId, modelId: input.modelId },
>         select: { displayName: true, maxOutputTokens: true }
>     }),
> ])
> if (!provider || !model) throw new NotFoundError("The selected provider or model is not supported by the program")
> if (input.maxOutputTokens && model.maxOutputTokens < input.maxOutputTokens) throw new ConflictError("The model do not support the max output token as the user served");
> ```
> Re-verified live: an unknown `modelId` now gets a clean `404`, and a `maxOutputTokens` above the model's catalog cap gets a clean `409` — both before any provider call happens. Good fix, and it closes the "any string is accepted" and "`maxOutputTokens` never clamped" halves of this finding — **for `startSession` only**. `continueSession`'s branch 2 (fresh message on an existing session) still doesn't clamp `input.maxOutputTokens` against the catalog, though the blast radius there is smaller since `providerId`/`modelId` are inherited from the session rather than user-supplied per-request, so the "supported model" half of the check doesn't apply there the same way.
>
> Cost computation is still completely untouched: no code anywhere multiplies `ModelCatalog.inputCostPer1M`/`outputCostPer1M` against the now-reliably-aggregated `AgentInteraction.inputTokens`/`outputTokens` (`grep -rn "costUsd|inputCostPer1M|outputCostPer1M" apps/api/src` → still no matches).

- ~~`startSession` never checks that `modelId` exists (or is `enabled`) in `ModelCatalog`~~ — fixed for `startSession`.
- ~~`maxOutputTokens` from the request is never clamped against the catalog's `maxOutputTokens` cap~~ — fixed for `startSession`; `continueSession`'s fresh-message branch still doesn't clamp it.
- `ModelCatalog.inputCostPer1M`/`outputCostPer1M` are seeded but still nothing multiplies them against the now-aggregated `AgentInteraction.inputTokens`/`outputTokens` to produce a cost figure — this part is unchanged and is now the only real gap left in this finding.

**Fix:** mirror `startSession`'s catalog-validation/clamp logic in `continueSession`'s branch 2, and compute `(interaction.inputTokens / 1_000_000) * model.inputCostPer1M + (interaction.outputTokens / 1_000_000) * model.outputCostPer1M` — either on read (in whatever endpoint eventually surfaces session/interaction details, see finding #5) or written back onto the interaction at the end of `runTurn`, whichever fits the intended UI better.

---

### 10. [LOW / cleanup] Dead, misleadingly-named constant in `auth.ts`

> **Status update (third pass, 2026-08-13): ✅ Fixed.** `export const CLI_CLIENT_ID = ...` is gone from `auth.ts` entirely — confirmed by reading the current file top to bottom. Everything now uses `environment.CLI_CLIENT_ID` exclusively, as it always should have.

> **Status update (second pass, 2026-08-13, superseded above): 🟡 Partially addressed.** The value changed from `"deepmind-cli"` to `"code-puppet-cli"` — no longer named after what looks like a different project, so the "did we copy-paste this from somewhere else" confusion was gone, but the export itself was still dead code at that point.

---

### 11. [Was: not reproduced live] Unregistered-provider errors can crash past an already-started SSE stream

> **Status update (2026-08-13): ✅ Fixed, confirmed by code review.** `runTurn` now starts with:
> ```ts
> const isProviderAvailable = providerRegistry.has(params.providerId);
> if (!isProviderAvailable) {
>     throw new NotFoundError("The selected provider is not available");
> }
> response.writeHead(200, { "Content-Type": "text/event-stream", ... });
> ```
> This is exactly the recommended fix — the check now happens *before* `response.writeHead(200, ...)`, so an unregistered provider throws a normal `NotFoundError` that flows through the standard Express error-handling path (clean JSON 404) instead of blowing past already-sent SSE headers. I did not re-attempt to reproduce the original scenario live (it still requires an admin-role user to create a mismatched `ProviderCatalog` entry, which needs a DB privilege escalation the sandbox correctly continues to block) — but the fix is structural and simple enough that code review alone is conclusive here.

**Where:** `packages/provider-registry/src/registry.ts:42` (unchanged — the underlying `ProviderRegistry.stream()` still calls `this.get(providerId)` outside its `try` block) — but this no longer matters in practice, because the controller now short-circuits before ever reaching that code path for an unregistered provider. `ProviderRegistry.get()` still isn't defensive on its own, so any *other* future caller of `providerRegistry.stream()` that doesn't replicate the controller's `has()` guard would reintroduce the same class of bug — worth fixing at the source too, eventually, but no longer an active issue for this flow.

---

### 12. [Architectural gap, not a bug per se] `apps/cli` has no tool-execution code yet

> **Status update (2026-08-13): ❌ Still open, unchanged.** `apps/cli/src` has no files touched by this remediation pass — still only `auth`/`account`/`config`/`doctor`/`init`/`list` commands, no tool-call handling.

`apps/cli/src` currently only has `auth`/`account`/`config`/`doctor`/`init`/`list` commands — there is no code anywhere that receives a `tool_call` SSE event, executes it locally (for `"file"`/`"process"`/`"git"`/`"user"` category tools), and posts the result back via `continueSession`.

---

### 14. [HIGH] `thinkingLevel: "INSTANT"` hard-failed every turn against the catalog's default model

> **Status update (third pass, 2026-08-13): ✅ Fixed, re-verified live.** `toOpenaiThinkingConfig` no longer maps anything to `"low"` — the mapping shifted up a tier across the board: `"INSTANT" → "medium"`, `"MID" → "high"`, `"HIGH" → "xhigh"`. Re-ran the exact repro from below (`thinkingLevel: "INSTANT"` against `gpt-5.5-pro`): it now succeeds (`"Hi!"`, `reasoningTokens: 18`, no error). This is exactly fix option 1 from the original write-up (below) — trading away a genuinely low-effort tier in exchange for never hitting the model-specific 400.
>
> **One residual trade-off worth knowing, not a bug:** the new mapping applies to *every* OpenAI model uniformly, not just `gpt-5.5-pro`. I checked `gpt-5.4` (a non-reasoning chat model) with `thinkingLevel: "INSTANT"` post-fix: it still reports `reasoningTokens: 0` regardless, meaning `reasoning.effort` is simply a no-op for models that don't do reasoning at all — so this costs nothing extra for non-reasoning models. But for reasoning-capable models other than `gpt-5.5-pro` that *did* support `"low"` (worth double-checking against OpenAI's current model list — not all reasoning-tier models necessarily share `gpt-5.5-pro`'s specific `medium`/`high`/`xhigh`-only restriction), `"INSTANT"` no longer gets them their cheapest/fastest tier either. Fix option 2 from below (per-model-aware effort clamping, driven by real catalog metadata) would recover that without reintroducing the crash — worth doing eventually, not urgent now that the hard failure is gone.

**Where:** `packages/provider-registry/src/providers/openai.ts` (`toOpenaiThinkingConfig`) interacting with `gpt-5.5-pro` specifically — surfaced only once finding #6 was actually wired end-to-end.

`toOpenaiThinkingConfig` maps `"INSTANT" → "low"`. That's a real, valid OpenAI `reasoning.effort` value in general — but not for every model. Live reproduction:

```text
POST /api/v1/agent-session
{ "providerId":"openai", "modelId":"gpt-5.5-pro", "credentialLabel":"default",
  "message":"Say hi.", "thinkingLevel":"INSTANT" }

→ data: {"type":"error","providerId":"openai","code":"unknown",
          "message":"400 Unsupported value: 'low' is not supported with the
                      'gpt-5.5-pro' model. Supported values are: 'medium', 'high', and 'xhigh'.",
          "retryable":false}
→ data: {"type":"done","stopReason":"ERROR"}
```

I checked whether this is specific to `gpt-5.5-pro` or a general OpenAI Responses API restriction: `thinkingLevel: "INSTANT"` works fine against `gpt-5.4` and `gpt-5.3-codex` (both accept `"low"`). It's specifically `gpt-5.5-pro` — the reasoning-tier "pro" model — that only supports `medium`/`high`/`xhigh` and rejects `low` outright. And `gpt-5.5-pro` happens to be the catalog's `isDefault: true` model (see finding #2), so this is the *default* model in the *default* configuration, hit by the *lowest* of the three `thinkingLevel` choices the schema itself offers.

This didn't matter before this pass (finding #6 was a no-op), and it doesn't trigger with the schema's own default (`thinkingLevel` defaults to `"MID"` → `"medium"`, which `gpt-5.5-pro` does support) — so it's easy to miss in casual testing. But it will hit real users the moment a "fast/instant" mode toggle in any client sends `thinkingLevel: "INSTANT"` while the session is on the default model, silently turning what should be a quick, cheap turn into a hard failure. Because finding #3 (error classification) is also still unfixed, this reaches the client as a generic `code: "unknown"` — there's currently no way for a client to distinguish "this level isn't supported for this model, try a different one" from any other kind of failure and react accordingly (e.g. by falling back to `"medium"` automatically).

**Fix options, roughly cheapest to most complete:**
1. Quick/tactical: in `toOpenaiThinkingConfig`, treat `"INSTANT"` as `"medium"` specifically for known reasoning/pro-tier models (or just never emit `"low"` at all, and map `INSTANT`/`MID`/`HIGH` → `medium`/`high`/`xhigh`), sacrificing a genuinely "instant" tier for safety.
2. Better: OpenAI's `ResponsesModel` type distinguishes reasoning-capable models from plain chat models; look up which `reasoning.effort` values a given `modelId` actually supports (there's no such metadata in `ModelCatalog` today — this would need a new column, e.g. `supportedThinkingLevels`) and clamp/reject before the request goes out, with a clear client-facing error rather than relaying OpenAI's raw 400.
3. Minimum viable: finish finding #3 first, so this at least surfaces as a specific, actionable `invalid_request`-style error instead of `"unknown"`, and document the `gpt-5.5-pro` restriction until (1) or (2) lands.

---

## What already works correctly

Re-verified live in this fourth pass, in addition to everything confirmed in the original audit and the first three remediation passes:

- Email/password sign-up, bearer-token issuance, `requireAuthentication` middleware — still fine, same session/user reused across all five passes without re-authenticating.
- Credential encryption/storage/retrieval round-trip — still fine.
- All four seeded OpenAI models (`gpt-5.5-pro`, `gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex`) still stream correctly, re-tested fresh this pass.
- The tool-call round trip continues to correctly *refuse* the category-mislabeling exploit from finding #1.
- `thinkingLevel` reaches every OpenAI model with no more crashes.
- `continueSession` correctly sources `mode` and `thinkingLevel` from the actual interaction.
- `ProviderCredential.lastUsedAt` updates correctly after a turn completes.
- Per-turn token usage correctly aggregates onto `AgentInteraction.inputTokens`/`outputTokens`.
- **New this pass:** `startSession` now correctly rejects an unrecognized `providerId`/`modelId` combination with a `404`, and rejects a `maxOutputTokens` above the model's catalog cap with a `409` — both re-verified live against the real catalog.
- `bun run typecheck` passes clean across `protocol`, `tool-registry`, `provider-registry`, `database`, and `apps/api`.

---

## What to do next (prioritized)

Three items remain genuinely open, plus a half-fixed finding and the `AnthropicProvider` stub. In priority order:

1. **Uncomment/finish finding #3** (`toProviderError` status mapping in `packages/provider-registry/src/error.ts`) — still the single highest-value remaining fix. It's the last thing standing between "a client can tell what actually went wrong" (bad key vs. rate limit vs. bad model vs. OpenAI outage) and everything being a generic, non-retryable `"unknown"`.
2. **Decide and implement finding #5's actual shape** — the route (`/:sessionId`) and schema (`ListSessionHistoryParamsSchema`) already point at "fetch one session's history"; finish that handler (scoped to `userId`, 404 if not found/not owned) rather than leaving it returning `{}`. If a separate "list all my sessions" capability is also wanted, it needs its own route.
3. **Finish finding #9** — mirror `startSession`'s new catalog-validation/clamp logic in `continueSession`'s fresh-message branch, and compute a `costUsd` figure from `ModelCatalog.inputCostPer1M`/`outputCostPer1M` × `AgentInteraction.inputTokens`/`outputTokens`. No new storage mechanism needed, just the arithmetic.
4. **Sandbox or remove the `bash` tool's raw shell execution** — finding #1's category-check fix correctly gates *which* tools can run server-side, but the `bash` tool itself is still unsandboxed `child_process.exec` once something legitimately routes through the `"backend"` category.
5. **`apps/cli` tool execution** (finding #12) — bigger piece of work, but required before any "file"/"process"/"git"/"user" category tool (including `bash`) can be used for real outside of hand-crafted test requests.
6. **`AnthropicProvider` is still a full no-op stub.** With Google and OpenAI both fully working now, this is the most visible remaining gap in the provider lineup.
7. Delete the stray `OPENAI_API_KEY` line in `.env` (finding #4) — trivial cleanup, no urgency.
8. **Context-window compaction** — new work, not a bug fix. See the design section immediately below for where it should live and how it should integrate with `runTurn`.

---

## Compaction design — where to add context-window compaction

**This section is a design proposal only. No source files were changed to produce it, per your instruction.** It answers: given the current architecture, where should the "if context is getting too large, compact it" logic live, where should the compaction function itself live, and how should `runTurn` consume compacted history?

### 1. What already exists to build on

The schema already has a table scaffolded for exactly this, currently unused by any code:

```prisma
model AgentSessionCompaction {
  id                 String   @id @default(uuid())
  sessionId          String
  summary            String
  coversFromSequence Int
  coversToSequence   Int
  createdAt          DateTime @default(now())

  session AgentSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, coversToSequence])
}
```

This is the right shape: `summary` holds the compacted text, and `coversFromSequence`/`coversToSequence` mark which range of `AgentMessage.sequence` (session-wide, monotonically increasing — see the schema's `@@unique([sessionId, sequence])` on `AgentMessage`) that summary replaces. No schema change is needed to build compaction on top of what's already there.

Two other existing facts make this straightforward to slot in:
- The provider is **stateless per request** — every turn already resends the *entire* session history from scratch (`continueSession`'s `prisma.agentMessage.findMany({ where: { sessionId }, orderBy: { sequence: "asc" } })`, `agent-session.controller.ts:396`). There's no `previous_response_id`/conversation-continuation state to worry about invalidating — compaction just changes *what* gets hydrated into that history before each call, nothing else downstream cares.
- The most recently completed `AgentTurn`'s `usage.inputTokens` **is already the exact token count of the full context that was just sent** (the provider counted the whole prompt, not just the newest message) — no separate tokenizer or token-counting library is needed to know "how big is the context right now."

### 2. Where the 70%-threshold check and compaction trigger should live (the write side)

**Recommended location: the end of `runTurn`, after its persistence transaction commits, using the turn's own `usageInfo.inputTokens` against `ModelCatalog.contextWindow`.**

```ts
// apps/api/src/controller/agent-session.controller.ts, inside runTurn,
// after the existing `await prisma.$transaction(async (tx) => { ... })` block:

response.end();

// fire-and-forget: compaction must never delay or fail the user's turn.
// the client has already received their full response by this point.
void checkAndCompactSession({
    sessionId,
    providerId: params.providerId,
    modelId: params.modelId,
    latestInputTokens: usageInfo?.inputTokens ?? 0,
    credential: params.credential,
}).catch((error) => {
    console.error(`Compaction check failed for session ${sessionId}:`, error);
});
```

Key decisions embedded in that placement:

- **After `response.end()`, not before.** Compaction requires an extra LLM call to produce the summary, which can take several seconds — that must never sit in front of the user seeing their answer. Firing it after the SSE stream has already closed means the client experiences zero added latency.
- **Fire-and-forget (`void ... .catch(...)`), not `await`ed.** If it were `await`ed inside `runTurn`, the Express handler wouldn't "finish" from the server's own bookkeeping perspective until compaction (with its extra LLM round-trip) completes, even though the client already got their response. Detaching it avoids tying request-handling resources/metrics to compaction latency. The tradeoff — an in-flight compaction can be abandoned if the process restarts mid-summarization — is acceptable here because compaction is a self-healing background optimization, not a user-facing guarantee; the next turn just re-triggers the check if it's still needed.
- **Checked after every completed turn, unconditionally** — not just when `interactionStatus !== "RUNNING"`. Context size grows the same way whether the interaction just finished or is mid-tool-call (`stopReason: "TOOL_USE"`); the next turn, whatever kind it is, will resend the same full history either way, so the check shouldn't be skipped for tool-call turns.
- **The threshold check itself** needs `ModelCatalog.contextWindow` for `(providerId, modelId)` — a single indexed lookup (`@@unique([providerId, modelId])` already exists on `ModelCatalog`). Do this lookup *inside* the new compaction-check function (see section 3), not as a param threaded through every `runTurn` call site — keeps `ProviderTurnCall`'s shape unchanged and keeps this entirely self-contained.

### 3. Where the compaction function itself should live

**Recommended: a new file, `apps/api/src/service/compaction.ts`**, alongside the existing `apps/api/src/service/credential-vault.ts` and `apps/api/src/service/audit.ts` — this codebase already uses `service/` for exactly this kind of controller-adjacent business logic that's too much for the controller file itself but isn't a generic reusable package.

Sketch of what it needs to do, in order:

```ts
// apps/api/src/service/compaction.ts (sketch — not implemented)

const COMPACTION_THRESHOLD = 0.7;

export async function checkAndCompactSession(params: {
    sessionId: string;
    providerId: string;
    modelId: string;
    latestInputTokens: number;
    credential: { apiKey: string; id: string };
}): Promise<void> {
    const model = await prisma.modelCatalog.findFirst({
        where: { providerId: params.providerId, modelId: params.modelId },
        select: { contextWindow: true },
    });
    if (!model) return; // shouldn't happen post finding-#9's validation, but don't crash if it does

    if (params.latestInputTokens / model.contextWindow < COMPACTION_THRESHOLD) {
        return; // under threshold, nothing to do
    }

    // idempotency guard: find out what's already been compacted, and how far
    // messages actually go right now, before doing any expensive work
    const [latestCompaction, latestMessage] = await Promise.all([
        prisma.agentSessionCompaction.findFirst({
            where: { sessionId: params.sessionId },
            orderBy: { coversToSequence: "desc" },
        }),
        prisma.agentMessage.findFirst({
            where: { sessionId: params.sessionId },
            orderBy: { sequence: "desc" },
        }),
    ]);

    const coversFromSequence = (latestCompaction?.coversToSequence ?? 0) + 1;
    const coversToSequence = alignToTurnBoundary(latestMessage?.sequence); // see note below

    if (!latestMessage || coversFromSequence > coversToSequence) {
        return; // another concurrent call already compacted this range - nothing new
    }

    const messagesToCompact = await prisma.agentMessage.findMany({
        where: { sessionId: params.sessionId, sequence: { gte: coversFromSequence, lte: coversToSequence } },
        orderBy: { sequence: "asc" },
    });

    const summary = await summarizeTranscript({
        // IMPORTANT: feed the *previous* compaction's summary text back in as
        // the leading context, not just the new raw messages - otherwise a
        // second compaction pass would silently drop everything the first
        // one already condensed. See note below.
        priorSummary: latestCompaction?.summary,
        messages: messagesToCompact,
        providerId: params.providerId,
        modelId: params.modelId,
        credential: params.credential,
    });

    await prisma.agentSessionCompaction.create({
        data: { sessionId: params.sessionId, summary, coversFromSequence, coversToSequence },
    });
}
```

Things worth calling out explicitly in that sketch:

- **`summarizeTranscript` is one more LLM call**, made the same way `runTurn` already talks to a provider (`providerRegistry.stream(...)`, draining the `text_delta` events into a single string instead of forwarding them over SSE — there's no non-streaming path on `ProviderAdapter` today, but draining a stream internally without piping it to any HTTP response is a legitimate, already-supported use of the same interface). It should use a **new, dedicated system prompt** (e.g. a `COMPACTION_SYSTEM_PROMPT` constant next to the existing `SYSTEM_PROMPTS` in `apps/api/src/utils/system-promt.ts`) instructing the model to produce a dense, faithful summary that preserves: the user's original goals/requests, key decisions made, file paths and specific values touched, and any tool calls and their outcomes — explicitly *not* a stylistic rewrite, a lossy-but-load-bearing condensation.
- **Which model/credential to run the summarization with**: simplest and safest default is the *same* `providerId`/`modelId`/`credential` as the session itself — no extra credential lookup, no new failure mode from a second provider being unavailable/misconfigured, and it guarantees the model doing the summarizing can actually read everything in the transcript (same or larger context window than whatever produced it). A cheaper/faster override model is a plausible future optimization, not a blocker for a first version.
- **Turn/message-boundary alignment (`alignToTurnBoundary`) matters a lot.** `coversToSequence` must never land in the middle of a tool-call/tool-result pair — cutting between an assistant's `tool_calls` message and its matching `TOOL` result message(s) would leave a compacted summary on one side and a dangling, meaningless tool result on the other, which would confuse (or outright break, depending on the provider's strictness about matching `call_id`s) the next turn's hydrated history. The safe boundary is always the last message of a *fully completed* turn — i.e., pick `coversToSequence` from the latest `AgentTurn` whose `stopReason` is not `"TOOL_USE"` (or, more precisely, whose subsequent tool-result messages, if any, have already been written), not simply "whatever the newest message row is." This needs to be a real function, not the placeholder name used above.
- **Compaction repeats over the session's lifetime.** Once a session crosses 70% again after being compacted once, the same check fires again — `coversFromSequence` picks up right after the previous compaction's `coversToSequence`, so each compaction only has to summarize the *new* material since last time. But because only the single most recent `AgentSessionCompaction` row is used on the read side (section 4), the new summary must be produced *from* the previous summary *plus* the new raw messages, not from the new raw messages alone — otherwise everything the first compaction preserved would be silently lost the moment a second compaction happens. That's why `priorSummary` is fed into `summarizeTranscript` above.
- **Failure isolation**: if `summarizeTranscript` throws (provider error, rate limit, etc.), the `.catch()` at the call site in section 2 logs it and moves on — the session simply stays uncompacted and the *next* turn will just resend the same (large) history and re-attempt compaction after it completes. It should never surface as a user-facing error on the turn that triggered it, since that turn already finished successfully by the time this runs.

### 4. Where the "check compaction first, then append the rest" read-side logic should live

This is the part the request specifically called out: **`runTurn` should check for compaction data before hydrating anything else.** Today, message hydration doesn't happen inside `runTurn` at all — it happens in the caller: `continueSession` builds the full `messages: ProviderMessage[]` array itself (`agent-session.controller.ts:396-402`) and hands it to `runTurn` as a plain param; `startSession` hands `runTurn` a trivial one-message array since there's nothing else yet. `runTurn` itself just forwards whatever `messages` array it's given straight to `providerRegistry.stream(...)`.

**Recommended refactor: move hydration *into* `runTurn`, and have it consult `AgentSessionCompaction` as the first step.** This matches "runTurn first checks if compaction data is present" literally, and is possible with no loss of information because **both callers already persist every message for the current turn to the database before calling `runTurn`** (`startSession` writes its seed `AgentMessage` inside its own transaction before calling `runTurn`; `continueSession` writes the new user message or tool-result message(s) before calling `runTurn` too). So `runTurn` re-hydrating "everything since the last compaction" from the DB, using only `params.sessionId` (which it already has), naturally includes the just-written message(s) — nothing needs to be passed in separately anymore.

```ts
// apps/api/src/controller/agent-session.controller.ts (sketch — not implemented)
// ProviderTurnCall would drop its `messages` field entirely; runTurn builds it internally:

async function runTurn(params: ProviderTurnCall): Promise<void> {
    // ... existing provider-availability check and response.writeHead(...) ...

    const { messages, compactionSummary } = await hydrateSessionMessages(params.sessionId);

    const systemPrompt = compactionSummary
        ? `${params.systemPrompt}\n\nSummary of earlier conversation (not shown above):\n${compactionSummary}`
        : params.systemPrompt;

    const stream = providerRegistry.stream(
        params.providerId,
        { modelId: params.modelId, messages, systemPrompt, /* ...unchanged... */ },
        { apiKey: params.credential.apiKey },
        abortController.signal,
    );
    // ... rest of runTurn unchanged ...
}

async function hydrateSessionMessages(sessionId: string): Promise<{ messages: ProviderMessage[]; compactionSummary?: string }> {
    const latestCompaction = await prisma.agentSessionCompaction.findFirst({
        where: { sessionId },
        orderBy: { coversToSequence: "desc" },
    });

    const rows = await prisma.agentMessage.findMany({
        where: { sessionId, sequence: { gt: latestCompaction?.coversToSequence ?? 0 } },
        orderBy: { sequence: "asc" },
    });

    // ...the exact same row -> ProviderMessage mapping that continueSession does today...

    return { messages, compactionSummary: latestCompaction?.summary };
}
```

Two design choices worth flagging explicitly:

- **Where the summary gets reinjected: as an appended fragment on `systemPrompt`, not as a synthetic fake message in the `messages` array.** `getSystemPrompt` in `packages/provider-registry/src/utils.ts` already merges `request.systemPrompt` with any `role: "system"` messages, so treating the compaction summary as background/context information read naturally and avoids fabricating a conversational turn that never actually happened (which could confuse providers that are strict about alternating user/assistant roles, or a model that starts treating the fake message as something to directly respond to rather than as background). The alternative — prepending a synthetic leading message instead — is workable too and is what some other agent harnesses do, but the system-prompt-fragment approach fits this codebase's existing `getSystemPrompt` mechanism with zero new provider-side plumbing.
- **This refactor is a net simplification, not just a relocation.** `continueSession`'s existing 6-line hydration block (`agent-session.controller.ts:396-402`) would be deleted entirely — `startSession`'s special-cased single-message array goes away too — leaving exactly one place (`hydrateSessionMessages`, compaction-aware from day one) responsible for building what gets sent to a provider, instead of two call sites doing overlapping work with `continueSession` compaction-aware and `startSession` implicitly always compaction-free (which happens to be correct for `startSession` today only because a session can't have any compaction yet on its very first turn — a fragile invariant to rely on going forward rather than something structurally guaranteed).

### 5. Open questions to settle before implementing (not blocking the design, worth a decision either way)

- **Should the summarization call's own token usage be counted anywhere?** It's an internal maintenance operation, not a user-visible turn, so folding it into `AgentInteraction.inputTokens`/`outputTokens` (the finding-#8/finding-#9-era aggregation) would conflate "tokens the user's conversation used" with "tokens spent maintaining the conversation." Recommend tracking it separately if it needs to be tracked at all (e.g. a `costUsd`-style field on `AgentSessionCompaction` itself, once finding #9's cost computation exists) rather than folding it into interaction-level totals.
- **Concurrency beyond the idempotency check sketched in section 3**: two turns finishing in close succession on the *same* session (plausible if a client fires a fresh message immediately after a tool-result answer) could both pass the "is this range already compacted" check before either has written its `AgentSessionCompaction` row, and redundantly compact overlapping ranges. The sketch above narrows this window but doesn't eliminate it. A `pg_advisory_lock` keyed on `sessionId`, or a unique constraint attempt on `(sessionId, coversToSequence)` with a caught-and-ignored conflict, would close it fully — worth adding once the basic mechanism is working, not necessary for a first pass given compaction is idempotent-ish by construction (worst case: a harmless duplicate compaction row covering an overlapping range, not data loss or a broken conversation).
- **Threshold value and unit**: this design uses `usageInfo.inputTokens / model.contextWindow >= 0.7` directly against the *previous* turn's reported usage, which is exactly right for "compact before the *next* call would be dangerously large," but note it's inherently one turn behind — a single very large next message could still jump straight past 100% before the *following* check fires. Given `maxOutputTokens` is now clamped (finding #9) and typical single messages are small relative to a 400k–1M token context window on these models, this lag is unlikely to matter in practice, but it's worth knowing it's a "trailing indicator," not a hard cap enforced pre-flight.
