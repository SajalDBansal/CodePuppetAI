# `apps/api`

The CodePuppet backend. An Express + Prisma/Postgres service that owns user accounts, encrypted provider API keys, and the full lifecycle of an **agent session** — a multi-turn, streamed conversation with an LLM provider that can call tools mid-conversation. Both `apps/cli` and `apps/web` talk to this service; neither client holds any provider API keys or conversation state of its own.

For the full system picture (how this fits with the CLI and web app) see the [root README](../../README.md).

## What it does

- **Auth** — email/password sign-in for the web app, plus an OAuth-style device-authorization flow so the CLI can log in without ever seeing a browser (better-auth).
- **Credential vault** — stores each user's own OpenAI/Anthropic/Google API key, encrypted at rest, decrypted only in-memory right before a provider call.
- **Agent sessions** — starts and continues streamed conversations against a chosen provider/model, persisting every turn, message, and tool call to Postgres so a session can be replayed or resumed.
- **Tool execution** — runs `backend`-category tools (e.g. looking up earlier session messages) itself; trusts CLI/web-executed results for everything else, but always verifies a tool's *real* registered category before running anything server-side.
- **Context compaction** — summarizes older messages once a session's token usage approaches a model's context window, so long-running sessions don't blow past the limit.
- **Catalog & admin** — a public read-only provider/model catalog, plus admin-gated management of that catalog, app-wide settings, and an audit log.

## Tech stack

| Concern | Technology |
|---|---|
| Runtime | Bun (dev/start), compiles with `tsc` for production |
| Web framework | Express 4 |
| Database / ORM | PostgreSQL via Prisma (`@workspace/database`) |
| Auth | [better-auth](https://www.better-auth.com/) — email/password, bearer tokens, `admin` plugin, `deviceAuthorization` plugin |
| Validation | Zod v4 schemas, shared with clients via `@workspace/protocol` |
| LLM providers | `@workspace/provider-registry` — per-provider streaming adapters for OpenAI, Anthropic, Google |
| Tools | `@workspace/tool-registry` — tool definitions and server-side execution |
| Crypto | Node `node:crypto` — AES-256-GCM + HKDF-SHA256 for the credential vault |
| Testing | Jest (`@workspace/jest-presets`), `supertest` |
| Logging | `morgan` |

## Structure

```
src/
  auth/auth.ts                 better-auth instance (email/password, bearer, admin, device-auth plugins)
  controller/                  one class per resource — agent-session, credential, catalog,
                                configuration, device-login, admin, user, health
  router/                      Express routers wiring routes → controller methods + middleware
  middleware/                  authentication (requireAuthentication/requireAdministrator),
                                error-handler, rate-limit, not-found
  service/
    credential-vault.ts        AES-256-GCM encrypt/decrypt for stored provider API keys
    compaction.ts               session context-window compaction (summarize old messages)
    audit.ts                    writes AuditLog rows for admin/security-relevant actions
  utils/
    environment.ts              Zod-validated env config, provider/tool registry singletons
    api-error.ts, validate.ts, async-handler.ts, request.ts
  server.ts / index.ts          Express app assembly + process entrypoint
```

## How a request flows

`POST /api/v1/agent-session` (and its continuation route) stream a provider's response back to the client over Server-Sent Events while buffering it locally, then persist the whole turn — the `AgentTurn`, resulting `AgentMessage`(s), and updated `AgentInteraction`/`AgentSession` state — in a single Prisma transaction once the stream ends. Every provider call is stateless: the full message history for a session is replayed from the database (minus anything already summarized by compaction) on every turn. See the [root README's "How the backend works" section](../../README.md#how-the-backend-works) for sequence diagrams of the session and device-login flows, and [`docs/agent-session-flow-audit.md`](../../docs/agent-session-flow-audit.md) for a running audit of what's verified end-to-end.

## Running locally

From the repo root (see the [root README](../../README.md#local-setup) for full setup, including Postgres and env vars):

```bash
cd apps/api
cp .env.example .env   # fill in BETTER_AUTH_SECRET / VAULT_MASTER_KEY, see root README
bun run dev             # watches src/, loads env from ../../packages/database/.env + ./.env
```

Other scripts: `bun run test` (Jest), `bun run typecheck`, `bun run lint`, `bun run build` (`tsc`).
