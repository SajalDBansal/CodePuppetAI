# Repo Audit — Pending Work & Known Bugs

**As of `HEAD ebb2f51` ("chore: refresh the session-flow audit, env example and infra config"), working tree clean.**

## Context

This supersedes the two earlier audits in this thread (the original staged build report, and `docs/tool-registry-design.md`'s own status notes) — both are now partially stale. Two things changed materially since the last full pass:

1. **The tool-registry track finished.** All 11 tools across all 5 categories (`file-read`, `file-update`, `process`, `user`, `backend`) are implemented, tested, and wired into both the API (`backend`-category execution) and — this is new — the **CLI** (`packages/tool-registry`, `packages/protocol/src/tool-registry.ts`, `apps/cli/src/agent/tool-runner.ts`).
2. **The CLI grew a full session/streaming/tool-execution path independently**, committed on `main` (`4d341ef feat(cli): add the streaming agent loop`, `403514e feat(cli): add ask and session commands`, `78137ac feat(harness): add session summary/detail types and client methods`) — this was *not* built by me in this conversation and directly contradicts the original audit's finding that "the CLI has zero session/streaming/tool-execution code." That finding is now false. The CLI has a working `ask` and `session list|show|continue` command set, an agent loop (`apps/cli/src/agent/agent-loop.ts`), an SSE consumer (`streamer.ts`), and a tool executor (`tool-runner.ts`) that calls the same `@workspace/tool-registry` the API uses.

The bad news: the new CLI code has a structural gap around recovering stuck sessions, plus a handful of narrower bugs. This report leads with that.

**Correction (2026-08-21):** an earlier version of this report claimed the API never sets an `x-session-id` response header, breaking `startSession` end-to-end. That was wrong — it's set correctly at `agent-session.controller.ts:70` (`"X-Session-Id": sessionId` inside `runTurn()`'s `writeHead()` call, already committed as of `3978e93`, well before this report was written). The mistake was mine: an initial case-sensitive `grep -n "x-session-id"` missed the actual `"X-Session-Id"` casing in the source, and a follow-up read of the same section didn't catch it either. Confirmed correct on a fresh, careful read. Removed from Tier 0 below; see "What's confirmed solid" instead.

**Re-verification pass (2026-08-21, later same day):** every item still marked open below was re-checked fresh against the current working tree (not assumed carried-over) — Tier 0 #1's two triggers, Tier 1 #7 (Anthropic), and all of Tier 2. One more item turned out already fixed by someone else since the last check (Tier 2 #7, the `.env` typo); everything else open is still genuinely open, confirmed by direct reads/greps this pass, not by memory of the earlier pass.

---

## Tier 0 — Severe, live bugs (break primary flows today)

### 1. No recovery path for a session stuck at `RUNNING`

Since the `x-session-id` header does work, a `code-puppet ask` session *can* reach `TOOL_USE` today via the CLI's agent loop — which makes this directly reachable in normal use, not just a latent risk:

- Once `AgentInteraction.status === "RUNNING"` (set when a turn's `stopReason` is `TOOL_USE`), `continueSession`'s only accepted next call is `toolResults` for that exact pending call — a plain `message` throws a 409 (`agent-session.controller.ts:754-755`). There is **no cancel/abandon endpoint anywhere in the API** to give up on a stuck interaction.
- `apps/cli/src/commands/session.ts`'s `continue` command only ever sends a `message` (`.argument("<message>", ...)`) — there's no CLI command that can manually resubmit `toolResults`, so even a technically-recoverable stuck session has no CLI path back.
- **New, concrete trigger found in the new code:** `apps/cli/src/agent/agent-loop.ts:100-104` —
  ```ts
  const toolResults = await executeToolCalls(turn.toolCalls, { sessionId, userId: options.userId });
  if (controller.signal.aborted) return;
  ```
  `withAbortHandling`'s `SIGINT` handler (lines 121-138) calls `controller.abort()` on Ctrl+C. If the user hits Ctrl+C *while tools are executing* (e.g. a slow `bash` command), `executeToolCalls` still runs to completion (nothing inside it observes the abort signal — `executeToolCalls`/`executeToolCall` in `tool-runner.ts` take no `AbortSignal` parameter at all), the tool results get fully computed locally, and then the `if (controller.signal.aborted) return` on the next line **silently discards them** instead of posting them back. The session is left `RUNNING` server-side with no local record of the computed results and no way to resubmit them.
- **Second new trigger:** `tool-runner.ts:74-81` builds the execution context and calls `tool.execute()` inside a `try/catch`, but the `try` only wraps `tool.execute()` itself — not `resolveActiveWorkspaceRoot()` (line 75) or the `requiresConfirmation` `inquirer.prompt()` call (lines 52-60), both of which run *before* the `try` block starts. `inquirer` throws in non-interactive contexts (piped stdin, no TTY — a realistic CI/scripting scenario). If it throws here, the exception propagates uncaught out of `executeToolCall` → `executeToolCalls` → `drive()` → up to `withAbortHandling`'s catch, which only special-cases `AbortError` and rethrows everything else — the whole process exits with an error, `toolResults` never gets sent, and the session is stuck the same way.

Both triggers are reachable today via a normal `ask` session that ends up calling a `requiresConfirmation` tool — worth prioritizing accordingly.

---

## Tier 1 — Real bugs, narrower blast radius

**All six fixed** (2026-08-21), except item 7 (Anthropic) which is separate, larger work:

1. ✅ **`removeAllCredentials()` always returned `undefined`.** `packages/harness/src/api-client.ts` destructured `response.deleteCount`, but the API returns `{ deletedCount: result.count }` (`apps/api/src/controller/credential.controller.ts:88`) — field name mismatch. Fixed: client now reads `deletedCount`.

2. ✅ **`APIClient`'s own URL-normalization was broken.** `packages/harness/src/api-client.ts`: `.replace(/\$/, "")` stripped a literal `$` character, not a trailing slash. Fixed to `.replace(/\/$/, "")`, matching the correct version already in `apps/cli/src/utils/context.ts`.

3. ✅ **`catalog.controller.ts`'s `createModel` discarded its own result.** Was `return response.status(200).json({})`, throwing away the freshly created `model`. Fixed to `return response.status(201).json({ model })`, matching `updateModel`'s pattern.

4. **Typo in `catalog.controller.ts:77`** ("weas" → "was") — found already fixed by the time this was revisited; no action needed.

5. ✅ **Status-code inconsistency.** `createProvider`/`createModel` returned `200` on creation; fixed both to `201`, matching `credential.controller.ts`'s `save`. No client in this repo depends on the old `200` (both are admin-only routes with no caller in `apps/cli`/`apps/web` today — verified by grep) — checked via `response.ok`-style handling everywhere else, not an exact status match, so this is safe.

6. ✅ **`packages/harness`'s three local stores silently swallowed write failures.** `auth-store.ts`, `config-store.ts`, `catalog-store.ts` — each `set()` wrapped its `fs.writeJSON` in `try { ... } catch (error) { console.log(error) }` and resolved normally regardless of success. Fixed by removing the swallow entirely (matching the same file's own `clear()`, which already only catches the one *expected* case — `ENOENT` — and rethrows everything else). Every caller (`addWorkspaceRoot`, `selectCredential`, `clearCredential`, every login/init/config-save command) already runs inside a Commander action handler that flows through `program.ts`'s top-level catch, so a surfaced error now gets reported to the user instead of vanishing — no caller needed changes. Verified directly: pointed a `ConfigStore` at an unwritable path and confirmed `set()` now rejects with `EACCES` instead of resolving silently.

7. **`AnthropicProvider.stream()` is still a completely empty generator.** `packages/provider-registry/src/providers/anthropic.ts:13-19` — unchanged since the very first audit in this thread. Any session against the Anthropic provider yields zero events and completes silently with 0 tokens. Not fixed here — separate, larger work (a real provider implementation, not a small bug fix).

---

## Tier 2 — Longer-standing, still open (unchanged from earlier audits)

1. **Zero automated tests anywhere in the repo.** Confirmed again with a fresh `find` across `apps/`+`packages/` for `*.test.ts`/`*.spec.ts` — nothing. `packages/jest-presets`, Jest/ts-jest/supertest devDependencies in `apps/api` and `apps/cli` all still unused.
2. **Compaction is fully unimplemented.** Fresh grep for `Compaction` across `apps/api/src` — zero application-code matches (only the schema field/table exists, per `docs/tool-registry-design.md` §4.6's earlier analysis). `get_session_messages` (the one backend tool that reads around compaction) works today regardless, since it just reads raw messages — but nothing ever produces a compaction summary for it to be useful against.
3. **`apps/web` is still just a scaffold + auth pages.** Re-confirmed fresh: `page.tsx` is still the untouched Next.js/shadcn placeholder, and the only real routes are `/signin`, `/signup`, `/device` (the device-login path-mismatch bug fixed earlier in this thread is confirmed still correctly fixed). No session list, no chat UI, no credentials management, no profile page — the entire web-interface track from the original staged plan (Stage 4) is untouched.
4. **`docs/agent-session-flow-audit.md` is stale again, more so than before.** It self-describes as accurate as of commit `2122abc`; `HEAD` is now `ebb2f51`, many commits ahead (including every fix made in this thread). Anyone consulting it should re-verify line numbers rather than trust it.
5. ✅ **`list --tools` and `doctor`'s tool-registry check were commented out** (`apps/cli/src/commands/list.ts`, `apps/cli/src/commands/doctor.ts`) — fixed (2026-08-21). `list.ts`'s commented table referenced fields that no longer exist on `ToolDefinition` (`tool.affinity`, `tool.execution`, `tool.allowedEnvironments` — leftovers from an earlier, abandoned design); rewritten against the current shape (`name`, `category`, `description`, `requiresConfirmation`). `doctor.ts`'s check just needed uncommenting plus the `createToolRegistry` import. Both verified with `turbo run typecheck`.
6. ✅ **`bash`'s working directory was not confined to `workspaceRoot`.** Fixed (2026-08-21): `execAsync` now passes `cwd: context.workspaceRoot`. When the CLI supplies a `workspaceRoot` (the normal case via `tool-runner.ts`), commands run there; when it's `undefined` (no caller change needed), Node falls back to the host process's own cwd — identical to the old behavior, so this is non-breaking. Verified directly: `bash.execute({command: "pwd"}, {workspaceRoot: root})` returned `root`; the same call with no context returned the process's own cwd unchanged.
7. ✅ **`apps/cli/.env`'s `VERSIOn` typo is fixed** — now reads `VERSION=0.1.0` (found already corrected on a fresh re-check, 2026-08-21; not fixed by me, someone else's edit). `apps/cli/src/utils/context.ts`'s `process.env.VERSION` read now actually resolves.
8. **A real-looking `OPENAI_API_KEY` is still sitting commented in the local (gitignored) `apps/api/.env`**, alongside the dead `E2B_*` block. Not a repo leak (file is gitignored, confirmed via `git check-ignore`), but worth rotating/removing given credential-vault work is now live in this same codebase — a stray plaintext key next to intentionally-encrypted ones is the kind of thing that gets copy-pasted somewhere it shouldn't be.
9. ✅ **`packages/harness` duplicated protocol types locally instead of depending on `@workspace/protocol`.** Fixed (2026-08-21) — but not as a simple "add the dependency" change. Checking first turned up the real reason the original tradeoff looked appealing: `packages/protocol/package.json` listed `chalk`, `fs-extra`, `inquirer`, and `keytar` as dependencies with **zero usages anywhere in its source** (grepped fresh, confirmed empty) — `keytar` is a native module, so depending on protocol as-is would have pulled unnecessary native-module install risk straight into the CLI. Fixed both together: stripped `packages/protocol/package.json` down to its one real dependency (`zod`), then added `@workspace/protocol` as a real `dependencies` entry on `packages/harness` and replaced the duplicated `AgentCallModeSchema`/`ThinkingLevelSchema`/`ProviderStopReason`/`ProviderErrorCode`/`ProviderStreamEvent` definitions in `packages/harness/src/types.ts` with imports + re-exports from it, so existing consumers importing these from `@workspace/harness` are unaffected. Verified with `turbo run typecheck` across all 12 packages and a direct runtime check confirming the re-exported schemas are the genuine protocol ones.

---

## What's confirmed solid (no action needed)

- **The full tool-registry** (`list_directory`, `read_file`, `search_text`, `find_files`, `write_file`, `edit_file`, `delete_file`, `bash`, `request_confirmation`, `ask_user`, `get_session_messages`) — implemented, path-confined, truncated, validated, and runtime-tested across all five categories.
- **`credential.controller.ts`** — every query scoped by `userId`, no IDOR found.
- **`configuration.controller.ts`** — no in-controller auth checks, but correctly gated by `requireAdministrator` at the router level; verified this is not a gap.
- **`admin.controller.ts`, `user.controller.ts`, `health.controller.ts`** — no issues found.
- **`credential-vault.ts`** — AES-256-GCM, per-user HKDF-derived keys, AAD bound to `userId:providerId:label`. Sound.
- **`config-store.ts`'s workspace-root concept** (`HarnessConfigSchema.workspaceRoots`, `addWorkspaceRoot()`) — real, and already correctly wired end-to-end into the CLI's tool executor via `resolveActiveWorkspaceRoot()` → `ToolExecutionContext.workspaceRoot`.
- **`apps/web/app/device/device-approval.tsx`** — the path-mismatch fix from earlier in this thread is confirmed still present and correct.
- **No TODO/FIXME/XXX/HACK markers anywhere in source** — grepped fresh across all of `apps/`+`packages/`, zero real hits (only false positives in prose).
- **The `x-session-id` response header** (`agent-session.controller.ts:70`, read by `packages/harness/src/api-client.ts`) — set correctly for both `startSession` and `continueSession`; the CLI's `ask` command works end-to-end on this front.

---

## Recommended fix order

1. ✅ ~~The six Tier 1 correctness bugs~~ — done (2026-08-21): `deleteCount`→`deletedCount`, the `$`-vs-slash regex, `createModel`'s discarded result, `createProvider`/`createModel` status codes, and the harness stores' swallowed write errors. Verified with a full `turbo run typecheck` plus a direct runtime check of the store fix.
2. **Add a way to recover a stuck `RUNNING` interaction** (Tier 0 #1) — at minimum, an API endpoint to cancel/abandon one, and a CLI command to invoke it; independently, thread an `AbortSignal` into `executeToolCalls`/`executeToolCall` so Ctrl+C during tool execution doesn't silently drop computed results, and widen `tool-runner.ts`'s `try` to cover the confirmation prompt and `workspaceRoot` resolution too.
3. **Implement `AnthropicProvider.stream()`** — long-standing, unblocks a whole provider.
4. ✅ ~~Wire `bash`'s cwd to `context.workspaceRoot` and re-enable `list --tools`/`doctor`'s tool-registry check~~ — done (2026-08-21).
5. **Stand up minimal test coverage** — still zero anywhere; the bugs found by manual reading in this pass are exactly the kind automated tests would have caught (including the false positive in this report itself — a test would have proven the header worked instead of a fallible grep).
6. Everything else in Tier 2 (compaction, the web interface, doc staleness, cosmetic items) remains larger/lower-urgency work, unchanged in priority from the original staged plan.
