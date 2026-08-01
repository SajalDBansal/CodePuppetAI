# CodePuppet — Audit findings & prioritized next-steps list

## Context

The user asked for a full read-through of the codebase and docs (`README.md`, `docs/agent-session-flow-audit.md`, `docs/session-continue.md`, `docs/agent-session-schema-review.html`) to produce a single, ordered list of what's buggy and what should be implemented next. This is a report/backlog, not a single-feature implementation — so this plan file *is* the deliverable. It was built from three parallel read-only Explore passes: (1) repo/docs/TODO survey, (2) API/session-controller correctness audit, (3) database schema/migration audit. All three cross-checked each other and, importantly, found that **the project's own `docs/agent-session-flow-audit.md` is itself partially stale** relative to current `HEAD` (commit `2122abc`) — two of its "still open" findings (stub session-history endpoint, unclamped `maxOutputTokens`) are actually already fixed in code, while it doesn't mention several other bugs found here. So this list supersedes that doc; don't take it as current without re-verifying line numbers if time passes.

The codebase is a Turborepo/Bun monorepo: `apps/api` (Express + Prisma agent-session backend), `apps/cli`, `apps/web` (Next.js), and `packages/{database,protocol,provider-registry,tool-registry,harness,ui}`.

## Tier 0 — Correctness bugs in shipped, "working" endpoints (fix first — cheap, high impact, actively wrong today)

1. **`GET /agent-session/:sessionId` ignores the URL param and returns a random session.**
   `apps/api/src/controller/agent-session.controller.ts:191` validates `request.query` instead of `request.params` against an *optional* schema, so `sessionId` is always `undefined`. The Prisma `findFirst({ where: { id: undefined, userId } })` then returns an arbitrary session owned by the caller — not the one requested, and it fails silently. Fix: use the existing `SessionIdParamsSchema` (`packages/protocol/src/agent-session.ts:43-45`) against `request.params`, same pattern already used correctly in `continueSession` (`agent-session.controller.ts:379`).

2. **`GET /agent-session/` has no real "list sessions" behavior.**
   `getSessionMetadata` (`agent-session.controller.ts:166-187`) does `findFirst({ where: { userId } })` with no `orderBy`/pagination — one arbitrary session per user, not a list. Needs to become an actual paginated list endpoint (or be renamed/scoped if a single-session lookup was intended).

3. **`continueSession` isn't atomic — can permanently strand a session.**
   Unlike `startSession` (which wraps session+interaction+message creation in one `$transaction`, `agent-session.controller.ts:316-349`), `continueSession`'s fresh-message branch creates `AgentInteraction` (line 503) and the opening `AgentMessage` (line 516) as two separate calls. If the second write fails (e.g. a `(sessionId, sequence)` unique-constraint race from concurrent calls, or `decryptCredential` throwing on a corrupted credential, lines 538-542), the interaction is already committed as `RUNNING` with no messages — and every future call hits the "already running" guard (line 483-485) with no way out. Fix: wrap in `$transaction` like `startSession` does.

4. **SSE streaming has no safe error path.**
   `runTurn` (`agent-session.controller.ts:33-163`) calls `response.writeHead(200, ...)` at line 42 before running the persistence `$transaction` (94-160) with no surrounding `try/catch`. If that transaction throws, the error reaches `errorHandler` (`apps/api/src/middleware/error-handler.ts`), which unconditionally calls `response.status().json()` with no `headersSent` guard — throws `ERR_HTTP_HEADERS_SENT`, and the client's stream just hangs instead of getting an error frame. Fix: guard the error handler on `response.headersSent`, and/or wrap the transaction + `sendEvent` calls so a DB failure still calls `response.end()`.

5. **Cancelled interactions are recorded as `COMPLETED`.**
   `InteractionStatus.CANCELLED` exists in the schema (`packages/database/prisma/schema.prisma:240-245`) but nothing ever assigns it. When a client disconnects mid-stream, the provider yields `stopReason: "CANCELLED"` with no error, and `runTurn`'s status logic (`agent-session.controller.ts:92`) falls through to `"COMPLETED"` — partial token counts get aggregated onto `AgentInteraction` as if the call finished normally. Fix: branch on `stopReason === "CANCELLED"` explicitly.

6. **Unregistered tool name throws an uncaught, uncategorized error.**
   `toolRegistry.get(result.name)` is called outside the `try` block in `continueSession`'s tool-result branch (`agent-session.controller.ts:442`, re-called redundantly at 448). `ToolNotRegisteredError` isn't caught, so it falls through to a generic 500 instead of a 400/404 for what's a client input problem. Fix: move the lookup inside the `try`, remove the duplicate call, map the error to a proper 4xx.

7. **Request body size cap silently rejects legitimately-sized requests.**
   `json({ limit: "1mb" })` (`apps/api/src/server.ts:23`) vs. `StartSessionSchema.message` (900k chars) / `systemPrompt` (1M chars) allowed by Zod (`packages/protocol/src/agent-session.ts:14,16`) — large-but-valid requests get a 413 before validation ever runs. Reconcile the two limits.

## Tier 1 — Safety net before touching anything else

1. **There are zero automated tests anywhere in the repo.** `apps/api/src/__tests__/` exists but is empty; Jest/ts-jest/supertest are installed as devDependencies but unused; no other package has a test script at all. Given Tier 0 is entirely bugs that manual testing missed, standing up even minimal coverage for `agent-session.controller.ts` (session lookup, continue-session atomicity, cancel handling) should happen right after the Tier 0 fixes, before further feature work, so regressions get caught going forward.

## Tier 2 — Finish core provider/session features (the project's own stated priorities, cross-checked as still open)

1. **Provider error classification is fully commented out.** `packages/provider-registry/src/error.ts:50-83` — the whole status→error-code mapping (401→auth, 429→retryable rate-limit, 5xx→retryable, etc.) is dead code; everything collapses to `code: "unknown", retryable: false`, which then always marks the interaction `ERROR` even for retryable conditions. Uncomment/finish it.

2. **`AnthropicProvider.stream()` is a completely empty generator.** `packages/provider-registry/src/providers/anthropic.ts:14-19` — yields nothing, so any session against the Anthropic provider just hangs silently. Implement it (OpenAI/Google adapters in the same directory are the reference pattern).

3. **Usage/cost endpoint is a stub, and cost math doesn't exist anywhere.** `GET /agent-session/usage` returns `{}` (`agent-session.controller.ts:282-285`). `ModelCatalog.inputCostPer1M`/`outputCostPer1M` are seeded but never multiplied against the now-aggregated `AgentInteraction.inputTokens`/`outputTokens`. Implement real usage/cost rollup.

4. **Database hygiene from the schema audit:** add the missing FK/cascade on `AgentSession.userId` (currently no relation to `User` at all — deletes orphan rows), and add missing indexes on `AgentInteraction.credentialId`, `AgentMessage.turnId`, `AgentTurn.sessionId`, and `ProviderCredential.providerId`.

## Tier 3 — Tool execution completeness (security-sensitive — sandbox before expanding)

 1. **Sandbox the `bash` tool before doing anything else with tools.** `packages/tool-registry/src/tools/process.ts` runs unsandboxed `child_process.exec` with only a 10s timeout, no allowlist. `E2B_*` env vars exist in `.env`/`.env.example` but are fully unwired. This is the one item in the list with real security exposure, so it should land before tool surface area grows.

 2. **Tool registry is 80% unimplemented.** Only the `bash`/`process` category has an actual tool; `file`, `git`, `user`, `backend` categories are empty, and `getBackendTools()`, `getClientTools()`, `resolve()` in `packages/tool-registry/src/registry.ts:34-36` are no-op stubs never called anywhere.

 3. **CLI has no tool-execution code at all.** `apps/cli/src` has nothing that executes a tool call or posts results back via `continueSession` — needed for any client-side tool category to actually work end-to-end.

## Tier 4 — Larger unimplemented features

 1. **Context-window compaction is fully unimplemented.** `AgentSessionCompaction` table exists and is read (unused) in `getSessionByIdData`, but nothing ever writes to it — `continueSession` always resends the full uncompacted history. A design (not code) exists in `docs/agent-session-flow-audit.md`'s final section, including open concurrency questions (double-compaction race, trailing-indicator threshold) worth resolving before implementing.

 2. **`apps/web` has no actual application UI.** Only sign-in/sign-up/device-login pages exist; `apps/web/app/page.tsx` is still the unedited framework scaffold placeholder — there's no session/chat interface at all.

## Tier 5 — Small cleanup

 1. Update or regenerate `docs/agent-session-flow-audit.md` — it's the team's reference doc but is stale in at least two findings relative to current code (see Context above); risks misleading future work if trusted as-is.
 2. Remove the dead, commented-out `OPENAI_API_KEY` line in `apps/api/.env`.
 3. `docs/agent-session-schema-review.html` cuts off mid-document (its own TOC promises a "Findings" and "coverage" section that were never written) — either finish it or remove the dangling TOC entries.

## How to use this list

Work top to bottom — Tier 0 items are live correctness bugs in code paths that look "done," Tier 1 is the regression safety net, and Tiers 2-4 are the project's own stated roadmap in dependency order (error handling → Anthropic support → usage billing → tool sandboxing → tool completeness → bigger features). Each item above cites exact file:line locations so it can be picked up directly without re-exploring.
