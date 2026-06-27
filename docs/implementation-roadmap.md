# Implementation Roadmap: From Current State to a Working Agent Platform

**Scope:** This report lays out, in order, the stages needed to take this repo from what exists today to a working end-to-end AI coding harness (CLI agent loop, backend-persisted sessions, memory, code indexing, and a real web dashboard). It is a **planning document** — no code was changed to produce it.

It complements [`docs/data-architecture-report.md`](./data-architecture-report.md), which already covers the *data* side (schemas, parsing mechanics, database choices) in depth. Where a stage below overlaps with that report, it's referenced rather than repeated — this document's job is sequencing and scope across the *whole* project (CLI, API, web, infra), not just data.

Each stage lists: **Goal**, **What to build**, **Why this order**, and **Exit criteria** (how you know it's done and safe to move on). Stages are ordered so that each one only depends on what's already shipped — nothing later requires jumping ahead.

---

## Stage 0 — Baseline: what's actually built today

Grounding the plan in the real repo state, not assumptions:

| Area | State |
|---|---|
| **CLI** (`apps/cli`) | Commander-based (`deepmind`). Commands: `login`, `logout`, `config` (show/get/set/path), `account`, `list`, `doctor`, `init`. Two composable `preAction` hooks: auth+config-init check (`commands/hook.ts`), and workspace-trust check (`commands/workspace-trust.ts`, just added). No `chat`/`run`/`session`/`resume`/`memory`/`search` commands — they exist only as comments in `program.ts`. |
| **Backend** (`apps/api`) | Express + better-auth. Real routers: device-code CLI login (`cli.router.ts`), account, status, config defaults, provider/model catalog (admin CRUD + public read), encrypted credential vault (AES-256-GCM, HKDF per-user keys). **No LLM SDK dependency anywhere in the repo.** No streaming endpoint, no WebSocket/SSE library, no chat/session routes. |
| **Database** (`packages/database`) | Prisma + Postgres. Models: `User`, `Session` (auth, not agent), `Account`, `Verification`, `DeviceCode`, `ProviderCatalog`, `ModelCatalog` (already has per-1M-token cost fields), `ProviderCredential`. No `AgentSession`/`Message`/`ToolCall`/`UsageEvent`/`MemoryFact`/`SearchHistoryEntry`, no pgvector extension. |
| **Shared contracts** (`packages/protocol`) | `HarnessConfigSchema`, device-login/catalog/credential zod schemas. No `AgentStreamEvent` schema yet. **Dependency hygiene issue**: this package also pulls in `chalk`, `fs-extra`, `inquirer`, `keytar` — CLI-only, some native (`keytar`), which will break if `apps/web` ever imports it directly. Flagged again in Stage 6, where it becomes blocking. |
| **Web** (`apps/web`) | Next.js 16. Real, working pages: `/signin`, `/signup`, `/device` (device-approval flow), all genuinely wired to the backend via cookie sessions (`credentials: "include"`). No dashboard/home beyond the default shadcn scaffold at `/`. No typed API client — `lib/api.ts` is 16 lines (base URL + error parsing + redirect sanitizing), request bodies are raw object literals. |
| **UI kit** (`packages/ui`) | One component: `Button`. Actively used by web, but not yet a real design system (no Input/Card/Dialog/Table/Form). |
| **Logger** (`packages/logger`) | A stub (`console.log("logger: " + str)`), used in exactly one place in `apps/api`. `apps/cli` has its own separate, unrelated logger. `apps/web` doesn't log via any shared package. |
| **Infra** (`infra/`) | `docker-compose.database.yml` provisions Postgres + api + web containers — functional. `docker-compose.dev.yml` and `docker-compose.prod.yml` are empty files. No Redis, no vector DB, no queue. Dockerfiles exist for `web` and `api`; container-per-service topology, single instance. |
| **Testing/CI** | One test file in the whole repo (`packages/logger`'s trivial test). No `.github/workflows` — no CI pipeline configured. |

The single biggest gap: **the actual agent loop — the thing that makes this a coding harness — doesn't exist in code yet.** Everything below builds toward it, in the order that avoids rework.

---

## Stage 1 — Provider adapter + streaming pipe (no persistence yet)

**Goal:** Prove the backend can call an LLM provider and stream a normalized response back to the CLI, before any database work.

**What to build:**
- Add `AgentStreamEvent` union type to `packages/protocol` (exact shape proposed in `data-architecture-report.md` §4.1 — `text_delta`, `tool_call`, `usage`, `error`, `done`).
- Add one LLM SDK dependency to `apps/api` (start with a single provider — whichever has a stored `ProviderCatalog` entry you want to launch with first) and write **one adapter function** that converts that provider's raw stream into `AgentStreamEvent`s. Do not let any other code learn a provider's native format — this is the rule the data report calls the single most important decision in §4.1.
- Decide the streaming transport now: **SSE**, not WebSocket. At single-instance scale (today's infra) SSE is simpler, works over plain HTTP, and needs no new infra. The report's §9.5 already flags that a WebSocket/multi-instance setup would need Redis pub/sub — defer that until you actually run more than one API instance.
- Build one throwaway endpoint (e.g. `POST /api/v1/session/turn`) that: loads the user's stored credential via the existing vault (`service/vault.ts`), calls the provider, streams `AgentStreamEvent`s back over SSE. No database writes yet — this stage is purely "does the pipe work."
- CLI side: a minimal `deepmind chat` command that POSTs one message and renders `text_delta` events to the terminal. No tool execution, no session concept yet.

**Why this order:** Validates the riskiest, least-built part of the system (provider integration + streaming) in isolation, before compounding it with persistence and tool execution. Cheap to throw away and adjust if the first provider's stream shape turns out awkward.

**Exit criteria:** Running `deepmind chat "hello"` locally streams a real model response to the terminal, end-to-end, using a credential stored via the existing `deepmind` vault flow.

---

## Stage 2 — Session & transcript persistence (backend-authoritative)

**Goal:** Every turn is durably recorded server-side, per the architectural decision in `data-architecture-report.md` §2 and §9.2 (backend persists the transcript, not the CLI — expensive to reverse later, must be locked in now).

**What to build:**
- Add the Prisma models proposed in `data-architecture-report.md` §6: `AgentSession`, `Message`, `ToolCall`, `UsageEvent`. Migration in `packages/database/prisma`.
- Wire persistence into the Stage 1 adapter: as `AgentStreamEvent`s pass through the backend, write `Message`/`ToolCall` rows asynchronously (never blocking the live stream to the CLI) — the fan-out pattern from §4.1.
- On the `usage` event, compute cost using the existing `ModelCatalog.inputCostPer1M`/`outputCostPer1M` fields (already in the schema, per §4.2 and §9.6 — don't add a second pricing table) and write a `UsageEvent` row.
- Promote the Stage 1 throwaway endpoint to the real shape: `POST /api/v1/session/:id/turn`, creating a new `AgentSession` on first call.

**Why this order:** Can't build tool execution, resume, or memory on top of a transcript that doesn't exist yet. This is the foundation every later stage reads from.

**Exit criteria:** After a `deepmind chat` turn, `AgentSession`/`Message`/`UsageEvent` rows exist in Postgres and reflect exactly what the terminal displayed, including a correct cost figure.

---

## Stage 3 — CLI tool execution loop

**Goal:** The agent can actually *do* things in the user's workspace, not just chat.

**What to build:**
- CLI-side tool executor: given a `tool_call` event (read file, run shell command, apply an edit), execute it locally and POST the `tool_result` back to continue the same turn (mechanics in `data-architecture-report.md` §4.3).
- This is exactly where the newly-added **workspace-trust check** (`apps/cli/src/commands/workspace-trust.ts`) earns its purpose: before executing any tool call that touches the filesystem, the CLI already knows the current directory is one the user explicitly trusted (checked once at startup via the `preAction` hook) — no extra confirmation needed per tool call.
- Backend: accept `POST /api/v1/session/:id/tool-result`, persist it, and re-submit the conversation (including the tool result) to the provider to continue the stream — same `AgentStreamEvent` pipe from Stage 1/2, just re-entered.
- Rename/expand `deepmind chat` into the real `run`/`ask`/`chat` commands currently stubbed as comments in `program.ts`.

**Why this order:** Tool execution is meaningless without a persisted session to attach results to (Stage 2), and it's the first place workspace trust actually matters — validating that the Stage-just-shipped trust feature is load-bearing, not decorative.

**Exit criteria:** A prompt like "list the files in this directory" round-trips through a real tool call, executes locally, and the model's follow-up response reflects the actual result.

---

## Stage 4 — Session list & resume (cross-device)

**Goal:** `deepmind list sessions` and `deepmind resume <id>` work from any device, per `data-architecture-report.md` §7.

**What to build:**
- `GET /api/v1/session?limit=20` (list, with latest-message preview) and `GET /api/v1/session/:id/messages` (full history).
- CLI: `deepmind list sessions`, `deepmind resume <sessionId>` — reconstruct a local view, then continue the turn tagged with the existing `sessionId`.

**Why this order:** Trivial once Stage 2's persistence exists — this is almost pure read-path work, no new architectural decisions. Sequenced after tool execution (Stage 3) only so that resumed sessions actually contain realistic tool-call history to render, not just text.

**Exit criteria:** Start a session on one machine (or a fresh `~/.deepmind`), resume it from a different login, and the full prior transcript (including tool calls) reappears before the next turn is sent.

---

## Stage 5 — pgvector + Memory

**Goal:** The agent can save and recall facts across sessions (`data-architecture-report.md` §4.4, §6).

**What to build:**
- Switch `infra/docker-compose.database.yml`'s Postgres image to `pgvector/pgvector` (or `CREATE EXTENSION vector;` if managed Postgres) — per §5's recommendation, no separate vector DB service.
- Add `MemoryFact` model + an embedding table/column keyed by `pgvector`.
- Give the agent a `save_memory(text, scope)` tool (handled exactly like any other tool call, per §4.3/§4.4) as the explicit path; a background summarizer job as the implicit fallback.
- Retrieval: embed the query, vector search, join back to `MemoryFact` in Postgres for the text.

**Why this order:** Reuses the tool-call plumbing from Stage 3 and the persistence plumbing from Stage 2 — no new architecture, just a new tool and a new table. Needs pgvector, which is why it's sequenced before code indexing (Stage 6), which needs the same extension.

**Exit criteria:** Telling the agent something in one session and having it recall that fact, unprompted-by-context, in a later session.

---

## Stage 6 — Code indexing + search history

**Goal:** Semantic code search (Cursor-style), per `data-architecture-report.md` §8 — explicitly a second-phase feature, built after Stages 1-5 exist, not before.

**What to build:**
- CLI: walk the (trusted) workspace, hash files, upload only changed chunks to a backend indexing endpoint — reusing the exact trust boundary from Stage 3 (CLI never talks to the embedding model directly, per §1's "server holds the secret" pattern).
- Backend: chunk via tree-sitter, compute embeddings (reusing the credential system), persist `CodeFile`/`CodeChunk` (Postgres) + embeddings (pgvector) + optional `CodeEdge` adjacency table for "what calls this" queries.
- Log a `SearchHistoryEntry` row (§4.5) whenever a search-type tool runs — trivial once the search tool itself exists, which is why search history is folded into this stage rather than being its own.
- **Prerequisite fix before this stage touches `apps/web` at all:** resolve the `packages/protocol` dependency issue flagged in Stage 0 — strip `chalk`/`fs-extra`/`inquirer`/`keytar` out of that package (they belong in `apps/cli`, which already has its own copies of some of this logic) so `packages/protocol` stays a pure, browser-safe schema package. This matters starting here because Stage 7 will need web to import `@workspace/protocol` types for its typed API client, and a native dependency like `keytar` will break a Next.js build.

**Why this order:** Needs pgvector (Stage 5) and the CLI-to-backend trust/upload pattern already proven by tool execution (Stage 3). It's explicitly *not* a prerequisite for the core agent loop — the loop works fine without it, just less efficiently on large repos.

**Exit criteria:** Asking "where is X defined" retrieves real chunks instead of the model guessing/hallucinating a path, and re-running the indexer on an unchanged repo does no re-embedding work.

---

## Stage 7 — Web dashboard

**Goal:** Turn `apps/web` from three auth-flow pages into an actual product surface — session history, usage/cost, credential management, provider/model catalog admin.

**What to build:**
- Grow `packages/ui` beyond `Button` — the sign-in/sign-up/device pages currently hand-roll raw `<input>` elements; add `Input`, `Card`, `Table`, `Dialog`, `Form` primitives before building new pages so the dashboard doesn't repeat that pattern.
- Add a real typed API client in `apps/web/lib/`, built on the now-clean `@workspace/protocol` schemas (Stage 6's prerequisite fix) for request/response typing — replacing the current raw-`fetch`-with-object-literal pattern.
- Build the actual dashboard pages: session list/detail (reads Stage 4's endpoints), usage/cost view (reads Stage 2's `UsageEvent` ledger), credential management UI (backend already exists — `credential.router.ts` — just needs a frontend), and an admin UI for provider/model catalog (backend already exists — `provider.router.ts` — same situation).

**Why this order:** Every dashboard page here is a frontend for a backend capability that already exists by this point (credentials and catalog admin exist today; sessions/usage exist from Stage 2/4) — this stage is deliberately "wire up the UI last," so it's never blocked waiting on backend work, and doesn't get built against an API shape that's still changing.

**Exit criteria:** A user can log into the web app and see their real session history, usage/cost, and manage their own provider credentials — no direct database/API inspection needed to answer "what did I run and what did it cost."

---

## Stage 8 — Platform hardening

**Goal:** Close the gaps that don't block a working product but do block running it reliably/safely beyond a single developer's laptop.

**What to build (roughly priority order, can interleave with earlier stages as needed):**
1. **Logging consolidation** — decide whether `@workspace/logger` becomes the real shared logger (with levels, structured output) adopted by `apps/api` *and* `apps/web`, or whether `apps/cli`'s richer logger becomes the shared one instead. Right now there are three uncoordinated logging approaches across three apps.
2. **Rate limiting expansion** — today only `POST /cli/login/start` is rate-limited. Extend `fixedWindowRateLimit` (already built in `middleware/rate-limit.middleware.ts`) to the turn/streaming endpoints from Stage 1-2 before any public exposure — an unlimited streaming LLM endpoint is a direct cost-abuse vector.
3. **`VAULT_MASTER_KEY` rotation** — `keyVersion` already exists on `ProviderCredential` anticipating this (per §9.8), but there's no rotation code path. Not urgent at one key version, but a compromised master key currently has no remediation short of full re-encryption.
4. **Redis for multi-instance SSE** — only once the API actually runs as more than one instance behind a load balancer (§9.5); adds pub/sub so the instance holding a CLI's SSE connection can receive events from whichever instance is talking to the provider.
5. **Fill in `infra/docker-compose.dev.yml` / `docker-compose.prod.yml`** (currently empty) once there's an actual dev-vs-prod topology difference worth encoding (e.g., prod adding Redis from item 4, or a separate worker process for the Stage 6 indexer).

**Why this order:** None of these block a working agent loop, which is why they're sequenced after the product stages — but items 1-2 are cheap and worth doing opportunistically as soon as the relevant endpoints exist (don't literally wait until every earlier stage is 100% done).

---

## Stage 9 — Testing & CI

**Goal:** The repo currently has one trivial test file and no CI workflow — everything above has been validated manually so far. Before this becomes a team project rather than a solo one, that needs to change.

**What to build:**
- Add a `.github/workflows` (or equivalent) pipeline running `typecheck`/`lint`/`test` on every PR — none exists today.
- Test the provider adapter (Stage 1) against recorded/mocked stream fixtures per provider — this is the piece most likely to silently break when a provider changes its stream format.
- Test the persistence fan-out (Stage 2) — a message/tool-call/usage row should always match what the CLI actually rendered.
- Test the auth middleware and device-code flow (already built, currently untested) — `requireAuth`/`requireAdminAuth` and the full `cli.router.ts` device flow are security-critical and have zero test coverage today.

**Why this order:** Deliberately last, not because testing doesn't matter, but because the shape of the code under test (adapter interfaces, event schemas, endpoint contracts) is still being decided through Stages 1-7 — writing extensive tests earlier would mean rewriting them repeatedly. The exception is the already-stable auth/device-code flow, which is safe to test today, independent of this roadmap's sequencing.

---

## Summary — the critical path

```
Stage 1 (provider adapter + streaming)
  → Stage 2 (persistence — the one hard-to-reverse decision)
    → Stage 3 (tool execution — makes workspace-trust load-bearing)
      → Stage 4 (list/resume)
      → Stage 5 (pgvector + memory)
        → Stage 6 (code indexing — needs pgvector + trust/upload pattern)
          → Stage 7 (web dashboard — fronts everything built by now)
Stage 8 (hardening) and Stage 9 (testing/CI) run alongside, starting as soon as the relevant piece from Stages 1-7 exists — they are not a final phase tacked on at the end.
```

The one decision from `data-architecture-report.md` worth repeating here because it's referenced by name in Stages 2-4: **the backend, not the CLI, is the system of record for the transcript.** Every later stage (resume, memory, indexing, the web dashboard) assumes that's already true — it has to be decided in Stage 2, not discovered as a gap later.
