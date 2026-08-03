# `apps/cli`

The `code-puppet` command-line tool — the primary way a developer interacts with CodePuppet from their own machine. It signs in against `apps/api`, stores its own local config, and is where per-workspace agent runs and local tool execution (file/process/git) are meant to happen, next to the developer's actual code.

For the full system picture see the [root README](../../README.md).

## What it does

- **`login` / `logout`** — signs in via the same device-authorization flow better-auth exposes on the API: the CLI prints a short code and opens the browser (`apps/web`'s `/device` page) for approval, then polls until an access token is issued. No token ever needs to be typed or pasted.
- **`auth`** — manage provider API credentials. Credentials are stored server-side (encrypted, per user) via the API; the CLI only manages *which* one is selected locally.
- **`init`** — pick a default provider/model (seeded from the backend's catalog) and trust a workspace directory for local tool execution.
- **`list`** — list available providers, models, or registered tools.
- **`config`** — show/get/set the CLI's local configuration file.
- **`doctor`** — runs diagnostics: backend reachability, database readiness, login status, local config, catalog cache, and workspace read/write access — everything you'd check before filing a "the CLI doesn't work" bug.

A `preAction` hook (`src/hook.ts`) gates most commands behind being logged in and having initialized config, and prompts to add the current directory to the trusted workspace list the first time it's used somewhere new.

## Tech stack

| Concern | Technology |
|---|---|
| Runtime | Bun |
| CLI framework | [Commander](https://github.com/tj/commander.js) |
| Interactive prompts | [Inquirer](https://github.com/SBoudrias/Inquirer.js) |
| HTTP client | Axios (wrapped by `@workspace/harness`'s `APIClient`) |
| Terminal output | Chalk (colors), custom table/logger helpers |
| Local persistence | `@workspace/harness` — on-disk auth/config/catalog stores |
| Opening a browser | `open` |
| Testing | Jest / Bun test |

## Structure

```
src/
  commands/          one file per command group — account (login/logout), auth, config,
                      doctor, init, list — registered onto a Commander program in program.ts
  hook.ts             preAction hook: auth/config gating + workspace-trust prompt
  presentation/       logger.ts (colored/quiet output, tables, status), table.ts
  utils/
    context.ts         env config, shared Harness instance, shared logger
    error.ts, format.ts
  program.ts          builds the Commander program
  index.ts             process entrypoint (calls runCli)
```

All local state (auth token, selected credentials, cached catalog, workspace roots) is delegated to `@workspace/harness`, which the CLI constructs once in `utils/context.ts` and reuses across every command.

## Running locally

```bash
cd apps/cli
cp .env.example .env   # CODE_PUPPET_API_URL defaults to http://localhost:3001/api/v1
bun run dev -- doctor    # or: login, auth add, init, list --tools, config show, etc.
```

Requires `apps/api` running locally (see the [root README](../../README.md#local-setup)) and, for `login`, `apps/web` running so the device-approval page is reachable.

Other scripts: `bun run typecheck`, `bun run test`.
