# `apps/web`

The CodePuppet web app — a Next.js frontend for account management, approving CLI device logins, and a browser-based chat UI for running agent sessions directly (no CLI required).

For the full system picture see the [root README](../../README.md).

## What it does

Routes are organized into three App Router groups, each with its own layout:

- **`(market)`** — public marketing/landing pages (`/`, `/details`). No auth required.
- **`(auth)`** — `/login`, `/signup`, and `/device` (where a user enters/approves the code shown by the CLI's `login` command — see the device-authorization flow in the [root README](../../README.md#authentication)).
- **`(main)`** — the authenticated app, gated by a server-side session check in its layout (redirects to login, preserving the original path, if there's no session):
  - **`/ask`** — a chat UI for starting and continuing agent sessions: streams the API's SSE response token-by-token, renders assistant text/tool activity live, and handles the small set of tools ASK-mode sessions can call from the browser (asking the user a yes/no confirmation or an open question, or looking up earlier messages in the session — everything else is resolved server-side).
  - **`/sessions`** — list of the user's past agent sessions.
  - **`/credentials`** — add/remove stored provider API keys.
  - **`/usage`** — token/cost usage.

`middleware.ts` stamps the requested path onto a request header so the `(main)` layout can redirect back to wherever the user was trying to go after they log in.

## Tech stack

| Concern | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Styling | Tailwind CSS v4, `@workspace/ui` (shared shadcn/ui component library) |
| Theming | `next-themes` (light/dark) |
| Icons | `lucide-react` |
| Data fetching | Native `fetch` against the API, cookie-based session (`credentials: "include"`); a hand-rolled SSE line-parser (`lib/agent-stream.ts`) reads the API's streamed agent-turn events |
| Auth | Session cookie issued by `apps/api`'s better-auth instance — read server-side per request via `lib/session.ts` |

## Structure

```
app/
  (market)/         public landing pages
  (auth)/            login, signup, device-approval
  (main)/            authenticated app: ask (chat), sessions, credentials, usage
  layout.tsx, error.tsx, not-found.tsx
components/
  app/               chat UI building blocks (composer, message bubbles, session pane, prompt card)
  site/              shared chrome — nav, account menu, theme toggle, login-required gate, logo
  theme-provider.tsx
lib/
  api.ts              API base URL + error-message parsing
  session.ts           server-side session lookup
  agent-stream.ts       SSE event types + parser for the API's streamed agent-turn protocol
  run-agent-turn.ts     drives one interaction to completion client-side, including the
                        browser-resolvable tool-use loop (confirmations/questions/session lookups)
  sessions.ts, session-detail.ts, catalog.ts, credentials.ts, usage.ts   typed API calls
  constants.ts, format.ts
hooks/
  use-mobile.tsx
middleware.ts          stamps the current path for post-login redirects
```

## Running locally

```bash
cd apps/web
bun run dev   # http://localhost:3000
```

Talks to the API at `NEXT_PUBLIC_API_HOST` (defaults to `http://localhost:3001` — no `.env` needed for local dev against a locally-running `apps/api`). See the [root README](../../README.md#local-setup) for the full stack setup.

Other scripts: `bun run build`, `bun run start`, `bun run lint`, `bun run typecheck`, `bun run format`.
