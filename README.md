# CodePuppet

CodePuppet is a self-hosted platform for running AI coding agents against your own codebase, backed by your own API keys. It's split into three pieces that share a common backend contract:

- **`apps/api`** — an Express + Prisma/Postgres backend that owns users, encrypted provider credentials, and the full lifecycle of an "agent session" (a multi-turn conversation with a model, including tool calls).
- **`apps/cli`** — a Node CLI (`code-puppet`) that developers install locally, log in from, and (eventually) run agent sessions from inside a real workspace, executing file/process/git tools on the developer's own machine.
- **`apps/web`** — a Next.js app used for account sign-up/sign-in and for approving CLI device-login requests in the browser.

Everything is written in TypeScript, managed as a Turborepo/Bun monorepo, with shared, versionless workspace packages for the provider abstraction, tool registry, wire-format schemas, and the CLI's local API client/config store.

> **Project status:** actively under development. Google and OpenAI provider streaming both work end‑to‑end; Anthropic is currently a stub. See [`docs/agent-session-flow-audit.md`](docs/agent-session-flow-audit.md) for a detailed, up-to-date audit of what's implemented vs. still open.

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [How the backend works](#how-the-backend-works)
  - [Data model](#data-model)
  - [Starting and continuing an agent session](#starting-and-continuing-an-agent-session)
  - [Authentication](#authentication)
  - [Credential storage](#credential-storage)
  - [Provider and tool registries](#provider-and-tool-registries)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Common scripts](#common-scripts)
- [API surface](#api-surface)

---

## What it does

CodePuppet lets a user:

1. Create an account and store their **own** LLM provider API key (OpenAI, Anthropic, or Google), encrypted per-user on the backend — the backend never uses a shared/global key.
2. Start an **agent session** against a chosen provider/model, streamed back over Server-Sent Events (SSE) token-by-token.
3. Let the model call **tools** mid-conversation — some tools (e.g. reading a file, running a shell command in the developer's own workspace) are meant to be executed by the CLI on the user's machine; others (`"backend"`-category tools) are executed by the API server itself. Tool results are fed back into the same conversation to continue the turn.
4. Log the CLI into their account via a **device-authorization flow** (type a short code, approve it from the browser) — no pasting long tokens into a terminal.

The whole system is intentionally "bring your own key": the server stores and uses only credentials the authenticated user has explicitly saved.

## Architecture

```mermaid
flowchart LR
    subgraph Client["Developer's machine"]
        CLI["apps/cli\ncode-puppet CLI"]
    end

    subgraph Browser
        WEB["apps/web\nNext.js (sign-in, sign-up, device approval)"]
    end

    subgraph Server["apps/api (Express)"]
        AUTH["better-auth\n(email/password, bearer, device auth)"]
        CTRL["Controllers\nagent-session · credential · catalog · admin"]
        PROVREG["provider-registry\nOpenAI · Anthropic · Google adapters"]
        TOOLREG["tool-registry\nbash / file / git / user tools"]
        VAULT["credential-vault\nAES-256-GCM, per-user derived key"]
    end

    DB[("Postgres\nvia Prisma\n@workspace/database")]
    EXT[["OpenAI / Anthropic / Google APIs"]]

    CLI -- "HTTPS + bearer token" --> CTRL
    WEB -- "HTTPS + cookie session" --> AUTH
    CLI -- "device-code login" --> AUTH
    CTRL --> AUTH
    CTRL --> VAULT
    CTRL --> PROVREG
    CTRL --> TOOLREG
    PROVREG -- "streamed completion" --> EXT
    CTRL --> DB
    AUTH --> DB
    VAULT -.->|"encrypted API keys"| DB
```

Three shared workspace packages sit underneath `apps/api`:

| Package | Purpose |
|---|---|
| `@workspace/database` | Prisma schema, generated client, seed data for the provider/model catalog |
| `@workspace/protocol` | Zod schemas + TypeScript types shared by the API and its clients (session requests, provider stream events, tool definitions) |
| `@workspace/provider-registry` | One adapter per LLM provider, all speaking a single internal streaming protocol |
| `@workspace/tool-registry` | Tool definitions (name, category, JSON-schema input, optional `execute`) |
| `@workspace/harness` | The CLI's local API client + on-disk config/auth/catalog stores |
| `@workspace/ui` | Shared shadcn/ui React components used by `apps/web` |

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript everywhere |
| Runtime / package manager | [Bun](https://bun.sh) (`bun@1.3.14`), Node.js ≥ 20 |
| Monorepo tooling | Turborepo (`turbo.json`), Bun workspaces |
| Backend framework | Express 4 |
| Database | PostgreSQL + Prisma ORM (`@prisma/client`, `@prisma/adapter-pg`) |
| Auth | [better-auth](https://www.better-auth.com/) — email/password, bearer tokens, admin plugin, OAuth-style device-authorization plugin |
| Validation | Zod v4 (request schemas live in `@workspace/protocol`) |
| LLM providers | `openai`, `@anthropic-ai/sdk`-style client, `@google/genai` (adapters in `@workspace/provider-registry`) |
| Frontend | Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui, `next-themes` |
| CLI | Commander, Inquirer (interactive prompts), Axios, Chalk |
| Testing | Jest (`apps/api`, presets in `@workspace/jest-presets`) |
| Infra | Docker Compose (Postgres for local dev), Dockerfiles for `apps/web` and `apps/cli` |

## Repository layout

```
apps/
  api/     Express backend — auth, sessions, credentials, catalog, admin
  cli/     `code-puppet` CLI — auth, init, config, doctor, list
  web/     Next.js app — sign-in/up, device-login approval
packages/
  database/          Prisma schema, migrations, catalog seed data
  protocol/           Shared Zod schemas & types (the wire format)
  provider-registry/  Per-provider streaming adapters (OpenAI/Anthropic/Google)
  tool-registry/       Tool definitions available to agent sessions
  harness/             CLI-side API client + local config/auth/catalog persistence
  ui/                  Shared shadcn/ui components
  eslint-config/, typescript-config/, jest-presets/   Shared tooling config
infra/
  docker-compose.database.yml   Local Postgres for development
docs/
  agent-session-flow-audit.md   Live findings on what currently works end-to-end
```

## How the backend works

### Data model

Everything under a user's account is scoped by `AgentSession`. Because every LLM call is **stateless** (the full conversation is resent every turn — nothing relies on a provider-side "conversation id"), the schema is built around an ordered, replayable log:

```mermaid
erDiagram
    User ||--o{ AgentSession : owns
    User ||--o{ ProviderCredential : owns
    AgentSession ||--o{ AgentInteraction : contains
    AgentSession ||--o{ AgentMessage : contains
    AgentSession ||--o{ AgentSessionCompaction : contains
    AgentInteraction ||--o{ AgentTurn : contains
    AgentInteraction ||--o{ AgentMessage : contains
    AgentTurn ||--o{ AgentMessage : produces
    ProviderCredential ||--o{ AgentInteraction : "used by"

    AgentSession {
        string providerId
        string modelId
        string systemPrompt
        enum status "ACTIVE | ARCHIVED"
    }
    AgentInteraction {
        int sequence
        enum mode "ASK | PLAN | CODE | AUTO"
        enum thinkingLevel "INSTANT | MID | HIGH"
        enum status "RUNNING | COMPLETED | ERROR | CANCELLED"
    }
    AgentTurn {
        int sequence
        enum stopReason "END_TURN | TOOL_USE | MAX_TOKENS | ..."
        int inputTokens
        int outputTokens
    }
    AgentMessage {
        int sequence
        enum role "SYSTEM | USER | ASSISTANT | TOOL"
        string content
        json toolCalls
    }
```

- **`AgentSession`** — one conversation, pinned to a provider/model, owned by a user.
- **`AgentInteraction`** — one logical "message exchange" within a session (sequence 1, 2, 3, ...). An interaction can span *multiple turns* if the model calls a tool: it stays `RUNNING` until the model produces a final answer with no pending tool calls.
- **`AgentTurn`** — one actual request/response round-trip to the provider. `inputTokens`/`outputTokens`/`reasoningTokens` are recorded per turn.
- **`AgentMessage`** — every user message, assistant message (text and/or tool calls), and tool result, in one session-wide, strictly increasing `sequence`. This table is what gets replayed back to the provider on every turn.
- **`AgentSessionCompaction`** — reserved for future context-window compaction (summarizing old messages once a session approaches a model's context limit); the table exists but nothing writes to it yet.

### Starting and continuing an agent session

There are exactly two entry points, and both stream their response over SSE:

- `POST /api/v1/agent-session` — starts a brand-new session (interaction `sequence = 1`).
- `POST /api/v1/agent-session/:sessionId/interactions` — continues an existing session, either with a fresh user message (starts a new interaction) or with `toolResults` answering a pending tool call (continues the current, still-`RUNNING` interaction).

Both routes funnel into the same internal `runTurn()`: stream the provider's response, buffer text/tool-calls/usage locally as they arrive, forward every event to the client immediately over SSE, and — only once the stream finishes — persist everything (the turn, the resulting message(s), updated interaction/session state, and `credential.lastUsedAt`) in a single Prisma transaction.

```mermaid
sequenceDiagram
    participant Client as CLI / Web
    participant API as apps/api
    participant DB as Postgres
    participant Provider as LLM Provider

    Client->>API: POST /agent-session {message, providerId, modelId, credentialLabel}
    API->>DB: validate model/provider + credential, create session+interaction+seed message
    API->>Provider: stream request (decrypted API key)
    loop streamed tokens
        Provider-->>API: text_delta / tool_call / usage
        API-->>Client: SSE: forward each event
    end
    Provider-->>API: done {stopReason}
    API->>DB: persist turn + message(s), update interaction/session (1 transaction)
    API-->>Client: SSE: done

    alt stopReason == TOOL_USE
        Client->>Client: execute file/process/git tool locally (or backend tool is executed server-side)
        Client->>API: POST /agent-session/:id/interactions {toolResults}
        API->>DB: look up pending tool_call args, run any "backend"-category tool
        API->>Provider: stream request (full history + tool result)
        Provider-->>API: text_delta / done
        API-->>Client: SSE stream
        API->>DB: persist turn + message(s)
    end
```

A few deliberate design points worth knowing:

- **Tool-execution trust boundary.** A tool result's `category` is *never* trusted from the client request — the server always looks up the tool's real registered category in `toolRegistry` before deciding whether to execute it itself. This closes what would otherwise be an arbitrary server-side code execution hole (see finding #1 in the audit doc).
- **Catalog-enforced limits.** `startSession` (and the fresh-message branch of `continueSession`) validates `providerId`/`modelId` against `ModelCatalog` and rejects a `maxOutputTokens` above the model's cap, before any provider call is made.
- **`mode`/`thinkingLevel` come from the interaction, not the request**, when continuing a `RUNNING` interaction — a tool-answer request doesn't get to silently reset the reasoning level or system prompt an interaction was started with.

### Authentication

Two different auth mechanisms are layered on top of the same `better-auth` instance (`apps/api/src/auth/auth.ts`):

- **Web app** — email/password sign-up/sign-in, session cookie, standard `better-auth` session middleware.
- **CLI** — an OAuth-style **device authorization flow**, since a terminal can't hold a browser session cookie.

```mermaid
sequenceDiagram
    participant CLI
    participant API as apps/api (better-auth)
    participant Browser
    participant User

    CLI->>API: POST /auth/device/code {client_id}
    API-->>CLI: {device_code, user_code, verification_uri}
    CLI-->>User: "Go to <verification_uri> and enter code XXXX-XXXX"
    User->>Browser: open verification_uri, sign in if needed
    Browser->>API: GET /cli/login/verify?userCode=...
    API-->>Browser: device request details
    User->>Browser: Approve
    Browser->>API: POST /cli/login/decision {userCode, decision: "approve"}
    loop polling every `interval`
        CLI->>API: POST /auth/device/token {device_code}
    end
    API-->>CLI: bearer access token (once approved)
    CLI->>CLI: store token locally via @workspace/harness
```

Every authenticated API request after that carries `Authorization: Bearer <token>`; `requireAuthentication` middleware resolves it via `better-auth`'s session API and attaches `request.authUser`/`request.authSession`. An `admin` plugin adds role-gated routes (`requireAdministrator`) for catalog and audit-log management.

### Credential storage

Provider API keys are **never** stored in plaintext and never read from a shared `.env` value — each user's key is:

1. Encrypted with **AES-256-GCM**, using a per-user key derived via **HKDF-SHA256** from a single `VAULT_MASTER_KEY`, salted with the user id and a key version.
2. Bound to `(userId, providerId, label)` as additional authenticated data (AAD), so a ciphertext can't be decrypted under a different user/provider/label than it was written for.
3. Decrypted only in-memory, immediately before a provider call, in `runTurn()`.

### Provider and tool registries

- **`ProviderRegistry`** (`packages/provider-registry`) holds one adapter per provider id (`openai`, `anthropic`, `google`), each implementing a common `stream()` generator that yields a normalized sequence of `text_delta` / `tool_call` / `usage` / `error` / `done` events — so the controller layer never has to know which provider it's talking to.
- **`ToolRegistry`** (`packages/tool-registry`) holds tool definitions (`name`, `category`, JSON-schema `inputSchema`, and an optional `execute`). Categories (`file`, `process`, `git`, `user`, `backend`) determine *where* a tool actually runs: everything except `backend` is expected to run on the developer's machine via the CLI; `backend` tools (currently just an unsandboxed `bash`) run on the API server itself.

## Local setup

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3 (repo pins `bun@1.3.14` as its package manager)
- Node.js ≥ 20 (Bun runs the code, but some tooling — Prisma CLI, Next.js — expects a Node-compatible environment)
- Docker (for the local Postgres container), or your own Postgres instance
- An API key for at least one of OpenAI, Anthropic, or Google, to actually exercise an agent session

### 1. Install dependencies

```bash
bun install
```

### 2. Start Postgres

```bash
docker compose -f infra/docker-compose.database.yml up -d
```

This starts Postgres 15 on `localhost:5432` with `local` / `local_123`, database `codepuppet` (matches the default `DATABASE_URL` below).

### 3. Configure environment variables

Copy the example env files and fill them in:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/cli/.env.example apps/cli/.env
```

`apps/api/.env` needs, at minimum, generated secrets:

```bash
openssl rand -base64 32   # use for BETTER_AUTH_SECRET
openssl rand -base64 32   # use for VAULT_MASTER_KEY
```

See [Environment variables](#environment-variables) below for what each key does. `apps/web` reads `NEXT_PUBLIC_API_HOST` (defaults to `http://localhost:3001` if unset — no `.env` file is required for local dev).

`packages/database` also needs its own `DATABASE_URL` (used when running Prisma commands directly against `packages/database`) — copy the same connection string used in `apps/api/.env`:

```bash
echo 'DATABASE_URL="postgresql://local:local_123@localhost:5432/codepuppet"' > packages/database/.env
```

### 4. Run database migrations and seed the model catalog

```bash
bun run db:migrate:dev
bun run db:seed
```

Seeding populates `ProviderCatalog`/`ModelCatalog` with the OpenAI, Anthropic, and Google models defined in `packages/database/src/catalog.ts` — this is what powers `code-puppet init` and the `startSession` provider/model validation.

### 5. Run everything

```bash
bun run dev
```

This runs `turbo dev`, starting the API (`:3001`), the web app (`:3000`), and watch-mode builds for the shared packages, all in parallel.

To run just one app:

```bash
cd apps/api && bun run dev     # API only
cd apps/web && bun run dev     # Web only
```

### 6. Try the CLI

```bash
cd apps/cli
bun run dev -- doctor          # sanity-check backend connectivity
bun run dev -- auth add        # store a provider API key (after signing up via the web app)
bun run dev -- init            # pick a default provider/model + trust a workspace
```

`CODE_PUPPET_API_URL` (from `apps/cli/.env`) tells the CLI where the API lives — it defaults to `http://localhost:3001/api/v1`.

## Environment variables

### `apps/api/.env`

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `PORT` | API port (default `3001`) |
| `APP_NAME` | Shown by better-auth (email templates, etc.) |
| `CLI_CLIENT_ID` | Client id the CLI must send when starting a device-auth flow |
| `ADMIN_USER_IDS` | Comma-separated user ids granted the `admin` role at boot |
| `BETTER_AUTH_URL` | Public URL of the API (used by better-auth for callbacks) |
| `BETTER_AUTH_SECRET` | Secret used to sign sessions/tokens — `openssl rand -base64 32` |
| `DEVICE_VERIFICATION_URI` | Web app URL the CLI tells users to visit to approve a device (`/device`) |
| `WEB_ORIGIN` | Allowed CORS origin / trusted origin for the web app |
| `VAULT_MASTER_KEY` | Base64, ≥32 bytes decoded — root key for credential encryption (HKDF-derived per user). **Rotating this invalidates every stored credential.** |

### `apps/cli/.env`

| Variable | Purpose |
|---|---|
| `CODE_PUPPET_API_URL` | Base URL of the API, including `/api/v1` |
| `AGENT_DEBUG` | Set to `1` for verbose CLI logging |
| `AGENT_NAME` | Display name used by the CLI |

### `apps/web`

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_HOST` | Base URL of the API (no path suffix), defaults to `http://localhost:3001` |

## Common scripts

Run from the repo root (fan out to every workspace via Turborepo):

| Command | Effect |
|---|---|
| `bun run dev` | Start every app in watch mode |
| `bun run build` | Build all apps/packages |
| `bun run lint` | Lint all workspaces |
| `bun run typecheck` | `tsc --noEmit` across all workspaces |
| `bun run format` | Run Prettier |
| `bun run db:migrate:dev` | Apply Prisma migrations locally (`prisma migrate dev`) |
| `bun run db:migrate:deploy` | Apply migrations in a deployed environment |
| `bun run db:push` | Push the Prisma schema without creating a migration |
| `bun run db:seed` | Seed the provider/model catalog |

Package-specific extras: `apps/api` has `bun run test` (Jest); `packages/database` has `bun run studio` (Prisma Studio) for browsing the local database.

## API surface

All routes are mounted under `/api/v1`. Auth routes (`/api/v1/auth/*`) are handled entirely by better-auth.

| Method | Route | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health/live` / `/health/ready` | — | Liveness / DB-readiness probes |
| `GET` | `/user/me` | bearer | Current user profile |
| `POST` | `/user/logout` | bearer | End the current session |
| `POST` | `/device-login/start` | rate-limited | CLI starts a device-authorization request |
| `POST` | `/device-login/token` | rate-limited | CLI polls for an access token |
| `GET` | `/device-login/verify` | bearer | Browser looks up a pending device request by user code |
| `POST` | `/device-login/decision` | bearer | Browser approves/denies a device request |
| `GET`/`POST`/`DELETE` | `/credentials` | bearer | List / save / remove provider API key(s) |
| `GET` | `/catalog/providers`, `/catalog/models` | — | Public, read-only provider/model catalog |
| `POST`/`PATCH`/`DELETE` | `/catalog/providers`, `/catalog/models` | bearer + admin | Manage the catalog |
| `GET` | `/configuration/bootstrap` | bearer | Defaults used by `code-puppet init` |
| `GET`/`PUT`/`DELETE` | `/configuration/list`, `/configuration/:key` | bearer + admin | Manage app-wide settings |
| `GET` | `/agent-session` | bearer | Session metadata |
| `GET` | `/agent-session/:sessionId` | bearer | Full session history (interactions, turns, messages, compactions) |
| `GET` | `/agent-session/usage` | bearer | Usage/cost summary (stubbed) |
| `POST` | `/agent-session` | bearer | Start a new session — streams SSE |
| `POST` | `/agent-session/:sessionId/interactions` | bearer | Continue a session (new message or tool results) — streams SSE |
| `GET` | `/admin/audit-log` | bearer + admin | Audit log of admin/security-relevant actions |
