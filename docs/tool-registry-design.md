# Tool Registry Design — categories, tool catalog, definition shape, and a build guide

## 1. Purpose

This is the reference design for finishing `packages/tool-registry` and wiring real tool execution through the CLI and API. It exists to answer three questions that came up while planning the tool build-out:

1. What tools do we actually need, organized by category?
2. What should a `ToolDefinition` look like so all of those tools (including the two categories that don't fit the current shape — `user` and `backend`) can be implemented on top of it without a redesign later?
3. In what order do we build this, package by package?

It's a design doc, not a change — nothing in this file has been implemented yet. Everything below is checked against the code as of today (`packages/protocol/src/tool-registry.ts`, `packages/tool-registry/src/*`, `apps/api/src/controller/agent-session.controller.ts`), including the `ToolCategorySchema` split into `file-read`/`file-update` that was made directly in the working tree just before this doc was written.

---

## 2. Where things stand today

- **`ToolCategorySchema`** (`packages/protocol/src/tool-registry.ts`): `"file-read" | "file-update" | "process" | "backend" | "user"`. Five categories — `git` was considered and dropped (§4.4).
- **`ToolDefinition`** (same file): `{ name, category, description, inputSchema, execute: (args: JsonObject) => Promise<string> }`. One shape for every category.
- **`ToolRegistry`** (`packages/tool-registry/src/registry.ts`): `register`, `has`, `get`, `list(category?)`, `getProviderTools()` (strips `category`/`execute`, giving the provider just `{name, description, inputSchema}`). `getBackendTools()`, `getClientTools()`, `resolve()` are empty stubs with zero call sites anywhere in the repo — dead code today.
- **Exactly one tool is registered**: `bash` (`packages/tool-registry/src/tools/process.ts`), category `process`, running unsandboxed `child_process.exec` with a 10s timeout. `packages/tool-registry/src/index.ts`'s `builtInTools` array has nothing else in it.
- **Mode gating exists now** (`apps/api/src/controller/agent-session.controller.ts`, `MODE_TOOL_CATEGORIES` / `getToolsForMode`): `ASK → []`, `PLAN → ["file-read", "backend"]`, `CODE`/`AUTO → ["file-read", "file-update", "process", "backend", "user"]` (all five categories). This is what `runTurn()` actually sends to the provider as available tools — it already reads the category split above, so any new category added here needs a decision about which modes get it.
- **No execution sandbox, by decision.** Tools run directly against the user's real project directory — no E2B/container/VM isolation is planned for now. `resolveWorkspacePath` (§6.2, already built in Step 2) still confines tool paths to the workspace root, but that's ordinary guardrail logic against typos/traversal, not an isolation boundary; it doesn't imply or require a sandboxed execution environment.
- **Execution/dispatch split** (`continueSession`, same controller file, tool-result branch): when the CLI posts back `toolResults`, the API only ever calls `tool.execute(args)` for results whose registered category is `"backend"` — every other category's result is trusted as-is, because the assumption is the CLI already ran it locally. This is the load-bearing design decision for everything below: **`packages/tool-registry` is one shared package imported by both the API and the (not-yet-built) CLI tool executor; the same `ToolDefinition[]` list is registered in both places, but only `backend`-category tools ever get `.execute()` called server-side.** Client categories get `.execute()` called CLI-side once that's built (see §7).
- **The CLI has zero tool-execution code** (confirmed in the earlier CLI audit): no import of `@workspace/tool-registry`, no dependency on it in `apps/cli/package.json`, nothing that reacts to a `tool_call` SSE event or posts `toolResults` back.
- **`packages/tool-registry`'s only dependency is `zod`** — no filesystem globbing, diffing, or git library is installed anywhere in the monorepo yet (checked `packages/tool-registry/package.json`, `apps/cli/package.json`).

---

## 3. Execution model — who runs what

Two execution sites, driven entirely by `category`:

| Category | Executed by | Why |
|---|---|---|
| `file-read`, `file-update`, `process`, `user` | **CLI**, locally, on the developer's machine | These touch the user's real filesystem/shell/terminal, or (for `user`) the user's actual attention — none of that exists on the API server. |
| `backend` | **API**, server-side, inside `continueSession` | These need something only the server has (direct DB access to the full, uncompacted message history; provider/session state) — the CLI has no way to produce that answer itself. |

Both sides import the *same* `createToolRegistry()` from `@workspace/tool-registry` and register the same tool list. The category is what decides which side calls `.execute()` — this is already how the API's dispatch works (`if (tool.category !== "backend") return result`, `agent-session.controller.ts`), it just needs a CLI-side counterpart that does the mirror-image thing: call `.execute()` for every category *except* `backend`, and forward `backend`-category tool calls straight through as pending results for the server to resolve.

This is also the reason `file` was split into `file-read`/`file-update` rather than staying one category: it lets `MODE_TOOL_CATEGORIES` (§2 above) hand `PLAN` mode real, useful capability (read the codebase) without also handing it the ability to mutate files — a distinction that wasn't expressible with a single `file` category. Confirmed as the right call; no change recommended there.

A **future web client** (per the longer-term plan) only ever runs `ASK` mode with zero client-executed categories reachable (`MODE_TOOL_CATEGORIES.ASK = []`), so it never needs any of this — it's mentioned here only because it's the reason `ASK` must stay empty rather than gaining `file-read` later without also solving how a browser would execute a `file-read` tool call (it can't).

---

## 4. Proposed tool catalog

Evaluating the six-category list against what was proposed, category by category.

### 4.1 `file-read` — matches what was proposed, naming cleaned up

| Tool | Args | Notes |
|---|---|---|
| `list_directory` | `{ path, recursive?, maxDepth? }` | "get file directory structure." Return a tree, not a flat list — cap depth/entry count so a huge repo doesn't blow the context window. |
| `read_file` | `{ path, offset?, limit? }` | Line-range support (like this very environment's own file-reading tool) so an agent can read a 5,000-line file in slices instead of dumping it whole. |
| `search_text` | `{ pattern, path?, regex?, caseSensitive?, maxResults? }` | Content search ("search text" = grep, not filename search — good that these were split in the original ask). Truncate results; a file tool that can return unbounded output is a context-window and cost problem, not just a UX one. |
| `find_files` | `{ pattern, path? }` | Filename/glob search ("search file"). Distinct from `search_text` — keep them separate tools, not one overloaded tool, since the input/output shapes genuinely differ. |

All four are pure reads — no `requiresConfirmation`, no workspace-root writes to worry about, only workspace-root *reads* (see §6.2).

### 4.2 `file-update` — recommend 3 tools instead of the proposed 4

The original list was `delete file, write file, create file, update file`. Recommendation: collapse `write`/`create` into one tool and add a distinct patch-style edit tool, for the same reason this very harness's own file-editing tools work this way:

| Tool | Args | Notes |
|---|---|---|
| `write_file` | `{ path, content }` | Create-or-overwrite, single tool. "Create" and "write" are the same operation from the filesystem's point of view (`fs.writeFile` creates if missing) — a separate `create_file` tool would just be `write_file` with an extra existence check, adding a tool the model has to choose between for no behavioral difference. |
| `edit_file` | `{ path, oldText, newText }` (or a diff/patch shape) | Targeted find-and-replace instead of a full rewrite. This is the one the original list was missing under the name "update file" — without it, every small change (fix one line) forces a full-file `write_file`, which costs more output tokens and risks silently dropping unrelated content the model didn't mean to touch. Worth having both: `write_file` for new files or genuine full rewrites, `edit_file` for everything else. |
| `delete_file` | `{ path }` | As proposed. |

All three are mutating → `requiresConfirmation: true` by default (see §6.3), and all three need workspace-root path confinement (§6.2) since a mistaken or adversarial `path` like `../../etc/passwd` must not resolve outside the workspace.

### 4.3 `process` — keep as proposed; runs directly against the real project directory, no execution sandbox

Just `bash`, matching what's already registered. **Decision: no E2B/container/VM isolation for now** — tools (including `bash`) run directly against the user's actual project directory, the same way the rest of the CLI already operates. This supersedes the earlier framing in this doc and in the staged build report (Stage 3, item 1) that treated sandboxing as a hard prerequisite before wiring `bash` into a live tool-call loop; that item is deferred, not required, for the build sequence in §7. The existing per-call timeout (§6.5) and `requiresConfirmation` (§6.3) remain the operative safety net, not process isolation.

### 4.4 `git` — resolved: no separate category, folds into `bash`

Verified directly (`git status`, `git diff --stat`, `git log`, `git worktree add`/`remove`, `git branch -D`, all run via plain shell) that every git operation — including worktree management — is just a shell command `bash` already runs correctly with no special handling. Per direction, no `git_*` tools or `git` category are being built: anywhere an agent needs git (status, diff, log, worktree create/remove, commit, branch, checkout), it uses `bash` with a `git ...` command. `ToolCategorySchema` was updated to five categories (`file-read`, `file-update`, `process`, `backend`, `user`) and `MODE_TOOL_CATEGORIES` no longer references `git`.

This does give up the two payoffs a dedicated category could have offered (structured diff output instead of raw text; gating `PLAN` mode to read-only git visibility without full `process` access) — noted here in case either becomes worth revisiting later, but not pursued now.

### 4.5 `user` — two tools, and a genuinely different execution model (flagged in §5)

| Tool | Args | Response shape |
|---|---|---|
| `request_confirmation` | `{ prompt, detail? }` | yes/no (+ optional reason on "no") — for "ask permission." |
| `ask_user` | `{ question, options? }` | free text, or a choice from `options` if given — for "ask a question." Mirrors the shape of this environment's own user-facing question tool: a question plus an optional small set of concrete choices reads better in a terminal (or, later, a web dialog) than an open-ended prompt every time. |

Both categories exist to *pause the turn and wait on a human*, which is a fundamentally different execution shape than "run this and return a string" — see §5.2.

### 4.6 `backend` — one concrete tool, implemented ahead of compaction itself

| Tool | Args | Notes |
|---|---|---|
| ✅ `get_session_messages` | `{ fromSequence, toSequence }` | Reads raw `AgentMessage` rows for the session directly from Postgres, bypassing whatever a compaction summary trimmed out — the exact "recover raw detail" step the schema-review doc's compaction design already specifies (there, as a human-facing `sessions show --full` flag; here, as the agent-facing equivalent). Implemented in `packages/tool-registry/src/tools/backend.ts`. |

**Corrected design, worth recording since it wasn't obvious going in:** the natural-sounding idea of also exposing `compact_session` and `get_last_compaction_summary` as agent-callable tools is wrong. Per the schema-review doc's own compaction design (§ "Compaction: made, stored, used, recovered"), compaction is a **server-side, threshold-driven check that runs right before every provider call** (previous turn's `inputTokens` vs. the model's `contextWindow`, crossing ~70% triggers it) — not something the model decides to invoke. By the time a model would notice and call a "compact" tool, the full uncompacted history has already been sent for that turn and the token cost already spent; models also have no reliable visibility into their own context-window budget unless told. Likewise, "the last compaction summary" should already be part of what the model sees every turn automatically (`loadContext` = latest summary + raw messages after `coversToSequence`) — never something it has to ask for — and "what to extend the next compaction from" is the *server's* lookup when it later builds a new compaction request, not the agent's concern. The one thing genuinely worth an agent-facing tool is retrieval of original detail behind an already-produced summary, which is what got built.

**How the summary's own "range index" works without a schema change:** rather than a separate structured DB column, the (not-yet-built) compaction-generation system prompt should ask the provider for the summary text *plus* an inline index as part of the same string stored in the existing `AgentSessionCompaction.summary` field — e.g. `"...\n\nCovered ranges:\n- seq 1-6: implemented the auth middleware\n- seq 7-15: added the session tests"`. The model reads that naturally as part of its context, and calls `get_session_messages` with the sequence numbers it saw right there when it wants the real detail.

**Data-access pattern:** `get_session_messages` needs a database read, but `packages/tool-registry` has no `@workspace/database` dependency and shouldn't gain one — that would make the CLI's eventual `@workspace/tool-registry` import pull in a Prisma client it never uses (only `backend`-category tools ever run server-side; the CLI never calls their `execute()`). Instead, `ToolExecutionContext.session` gained a `getMessages` callback (same dependency-injection shape already used for `promptUser`), supplied by `agent-session.controller.ts`'s `continueSession` as a closure over `prisma` (capped at 500 rows via `take`, on top of the tool's own `truncateOutput` call on the joined string — two independent caps on the same "don't return something enormous" concern, one on row count, one on character count).

Per the staged build report (Stage 5, item 1), **automatic compaction itself is still fully unimplemented** — `AgentSessionCompaction` is a real table that's read (unused) and never written, and this tool works correctly regardless (it just reads raw `AgentMessage` rows — there's no requirement that anything has ever actually been compacted for it to return real data). Building the threshold check / compaction-generation call / `loadContext` rewiring remains separate, larger, later work.

---

## 5. Required `ToolDefinition` shape

The current shape —

```ts
export type ToolDefinition = {
    name: string
    category: ToolCategory
    description: string
    inputSchema: ToolInputJson
    execute: (args: JsonObject) => Promise<string>
}
```

— is sufficient for `process`, `file-read`, and `file-update`: all three just need `args` plus a workspace root to operate inside. It's **not** sufficient for `backend` or `user`, which each need something the plain `args` parameter can't carry.

### 5.1 Proposed: an execution context alongside `args`

```ts
export type ToolExecutionContext = {
    workspaceRoot?: string
    // file-read / file-update / process: the workspace root every path/cwd
    // resolves inside (see §6.2). Required for those three categories.

    session?: { id: string; userId: string }
    // backend only: identifies which session's rows to read. The API supplies
    // this from the authenticated request - never sourced from client input.

    promptUser?: (prompt: UserPrompt) => Promise<UserPromptResult>
    // user only: injected by whichever client is running the turn. The CLI's
    // implementation reads from the terminal (inquirer); the shape is deliberately
    // generic so a future web client could inject a dialog-based implementation
    // instead without changing the tool definition itself.
}

export type ToolResult = {
    content: string
    isError?: boolean
    message: string
}

export type ToolDefinition = {
    name: string
    category: ToolCategory
    description: string
    inputSchema: ToolInputJson
    zodSchema: z.ZodTypeAny
    requiresConfirmation?: boolean
    execute: (args: JsonObject, context: ToolExecutionContext) => Promise<ToolResult>
}
```

**Implemented as of Step 1** (`packages/protocol/src/tool-registry.ts`) — this is the shape that actually landed, with two additions beyond what was first drafted above:

- **`zodSchema: z.ZodTypeAny`** — each tool's own runtime-validation schema (§6.1), carried on the definition itself rather than living only inside `execute()`. Typed as `z.ZodTypeAny` rather than `z.ZodType<JsonObject>` specifically so a tool's concrete schema (e.g. `z.object({ command: z.string().min(1) })`) doesn't fight TypeScript's variance rules when stored in the registry's homogeneous collection.
- **`execute` returns a structured `ToolResult`** (`{ content, isError?, message }`) instead of a bare `string`. This is a cleaner fit for §6.6's error contract than the originally-drafted plain-string return: a failing tool now returns `{ content: <error text>, isError: true, message: <short summary> }` directly from its own return statement, rather than the caller having to wrap a thrown error into that shape itself.

Two more additions beyond the context parameter:

- **`requiresConfirmation?: boolean`** — set on every `file-update` tool and on `bash`. This is metadata the *client* reads before calling `execute()`, not something `execute()` itself enforces; it's what lets the CLI show a "this will delete `foo.ts` — proceed? (y/n)" prompt driven by the tool definition instead of a hardcoded per-tool-name check.
- **Context is optional per-field, not per-category**, so the same `ToolDefinition` type covers all five categories without a discriminated union — a tool's `execute` just destructures whichever field(s) its category actually needs and ignores the rest. `file-read`/`file-update`/`process` read `workspaceRoot`; `backend` reads `session`; `user` reads `promptUser`.

### 5.2 Why `user` doesn't fit the "call execute, get a string back" model at all

Every other category's `execute()` is genuinely synchronous work with a bounded runtime — read a file, run a command, query the DB. A `user` tool's "work" is a human, on their own schedule, possibly walking away from the terminal for ten minutes before answering. Modeling that as an ordinary blocking `execute()` call is fine for the CLI (it's already running in one long-lived local process, and `inquirer` blocks on stdin the same way `bash`'s `execAsync` blocks on the subprocess) — but it does **not** carry over to a web client, where there's no equivalent of blocking on stdin; a web "ask the user" has to be modeled as a UI dialog that resolves a promise when clicked, running inside a browser event loop, not a synchronous CLI script.

This is fine and doesn't need solving now, since `ASK` mode (the only mode a web client will ever call) never gets the `user` category anyway — but it's worth stating explicitly so the `execute` signature and the `promptUser` injection point are designed with "some future client implements this differently" in mind from the start, rather than accidentally baking in CLI-only assumptions (like "read a line from stdin") into `packages/tool-registry` itself. `packages/tool-registry` should own the tool *definitions* (name, schema, description) and the *non-interactive* categories' execution; `promptUser` stays a caller-supplied function, never something `packages/tool-registry` implements itself.

### 5.3 `ProviderToolDefinition` (what actually goes to the LLM) — no change needed

```ts
export type ProviderToolDefinition = {
    name: string
    description: string
    inputSchema: ToolInputJson
}
```

This is already correctly stripped of `category`/`execute`/the new `requiresConfirmation` — the provider only ever needs to know a tool's name, description, and JSON Schema. No changes proposed here; `getToolsForMode()` (already built, `agent-session.controller.ts`) is the one place that turns registered tools into this shape, and it stays exactly as-is.

---

## 6. Cross-cutting concerns

### 6.1 Input validation

`inputSchema` today is a hand-written `ToolInputJson` object (JSON-Schema-shaped, sent to the provider as-is). Recommend each tool *also* keep a parallel `zod` schema internally (not sent to the provider) that `execute()` runs the incoming `args` through before doing anything — the provider's `arguments` are attacker/hallucination-adjacent input (an LLM can emit a malformed or missing field), and `execute()` should never trust `args` are shaped the way `inputSchema` claims. `zod` is already a dependency of `packages/tool-registry`, so this is a same-package addition, not a new dependency.

### 6.2 Path confinement (workspace root) — ✅ helper done in Step 2

Every `file-read`, `file-update`, and `process` tool takes a path (or, for `bash`, an arbitrary command that can reference paths) and must resolve it against `context.workspaceRoot`, rejecting anything that escapes it. This is guardrail logic, not an execution sandbox — per §4.3's decision, tools run directly against the real project directory with no isolation boundary; this is just what keeps a typo'd `../../` or an absolute path from wandering outside the intended project root during normal operation. Built as `resolveWorkspacePath(root, path)` in `packages/tool-registry/src/lib/workspace-path.ts` (Step 2) — resolves the path, then checks the result still starts with the root plus a trailing separator (not a bare `startsWith`, which a sibling directory like `root-evil` would otherwise slip past). Every path-taking tool goes through this one helper rather than re-implementing path safety.

### 6.3 Confirmation / permission flow

`requiresConfirmation` (§5.1) is the data; the *flow* is: CLI receives a `tool_call` SSE event → looks up the `ToolDefinition` → if `requiresConfirmation`, prompts the user (this can reuse the same `promptUser`/`inquirer` machinery the `user` category itself uses, or a simpler yes/no) → on "no," the tool is never executed and the result posted back is `{ isError: true, content: "User declined to run this tool." }` rather than a thrown exception, matching the existing "isError, never crash the interaction" contract already used for `backend`-category failures (`continueSession`'s existing catch branch).

### 6.4 Output size and truncation

`search_text`, `read_file` (without `offset`/`limit`), and `bash` are the three tools most likely to return something huge. Recommend a shared truncation helper (e.g. cap at some fixed character count, append `"... (truncated, N more lines)"`) applied uniformly, rather than each tool inventing its own limit — the 900,000-character cap already on `ContinueSessionToolResultSchema.content` (`packages/protocol/src/agent-session.ts`) is a hard backstop, but tools should truncate well before hitting it, since a single 900K-character tool result is still a very expensive turn.

### 6.5 Timeouts

`bash` already has one (10s, now caller-adjustable). Any `process` command that touches the network (e.g. `git fetch`/`git clone`) inherits that same timeout since it just runs through `bash` — no separate handling needed now that git isn't a distinct category. `file-read`/`file-update` tools don't need one (local disk I/O won't hang the way a subprocess can).

### 6.6 Error contract

Uniform across every category: a tool that fails (file not found, git command exits non-zero, user declines confirmation, backend query errors) returns normally with `isError: true` and a human-readable `content`, never throws past `execute()`. This is already the pattern `continueSession` relies on for `backend` tools (its `try/catch` around `tool.execute()`) — the CLI's client-side executor (§7) needs the identical contract so a single bad tool call can't crash an otherwise-healthy turn.

---

## 7. Step-by-step build guide

Ordered so each step only depends on what's already landed. Cross-references the staged build report's Stage 3 where relevant.

### Step 1 — ✅ done — `packages/protocol`: extend the shared types

- Added `ToolExecutionContext`, `UserPrompt`/`UserPromptResult`, and `ToolResult` types (§5.1) to `packages/protocol/src/tool-registry.ts`.
- Added `requiresConfirmation?: boolean` and `zodSchema: z.ZodTypeAny` to `ToolDefinition`.
- Changed `ToolDefinition.execute`'s signature to `(args: JsonObject, context: ToolExecutionContext) => Promise<ToolResult>` (structured result, not a bare string — see §5.1's "Implemented as of Step 1" note for why).
- `ProviderToolDefinition`, `ToolCategorySchema`, `ContinueSessionToolResultSchema` untouched at Step 1 time, as planned (`ToolCategorySchema` was later trimmed from six to five categories when `git` was folded into `bash` — see §4.4).
- Follow-on fixes required to keep the monorepo compiling once the signature changed (not scope creep into Step 2/4 — just what `execute`'s new required second parameter and new return shape broke):
  - `packages/tool-registry/src/tools/process.ts` (`bash`): added `zodSchema`, `requiresConfirmation: true`, switched to `zodSchema.safeParse` instead of a manual type-check + throw, and now returns `{ content, isError, message }` instead of a bare string or a thrown `Error`.
  - `apps/api/src/controller/agent-session.controller.ts`'s `continueSession` (the one call site of `tool.execute()` in the whole repo): now passes `{ session: { id: sessionId, userId } }` as the context argument, and reads `output.content`/`output.isError` from the returned `ToolResult` instead of treating the return value as the content string directly.
- Verified with `turbo run typecheck` across `api`, `cli`, `web`, and every package — all pass.

### Step 2 — ✅ done — `packages/tool-registry`: dependencies and shared helpers

- Added `fast-glob` (`^3.3.3`) as a dependency (`packages/tool-registry/package.json`) — `find_files`/`list_directory` (Step 3) will need it; `search_text` still doesn't, per the doc's original call to start with a plain regex match rather than a `ripgrep` binding.
- Built `resolveWorkspacePath(root, path)` in the new `packages/tool-registry/src/lib/workspace-path.ts` (§6.2), throwing `WorkspacePathEscapeError` for anything that escapes `root` — covers relative traversal (`../../etc/passwd`), an absolute path outside root, and the classic string-prefix bug (`/workspace-evil` naively passing a bare `startsWith("/workspace")` check against root `/workspace`) via an explicit trailing-separator comparison. Spot-checked all three escape cases plus the normal-path case directly (`bun -e`), all correct.
- Built `truncateOutput(text, maxChars = 50_000)` in the new `packages/tool-registry/src/lib/truncate.ts` (§6.4), appending an explicit `"... (truncated, N more characters)"` marker rather than silently cutting text. Both helpers are internal to the package (not re-exported from `index.ts`) — Step 3's tool files import them by relative path, since nothing outside `packages/tool-registry` needs them directly.
- `ToolRegistry.list()`/`getProviderTools()` — confirmed unchanged and still correct against the Step 1 `execute` signature (neither touches `execute` at all); `turbo run typecheck` across all 12 packages is the verification, no code change was needed here.
- Deleted `getBackendTools()`, `getClientTools()`, `resolve()` from `registry.ts` (re-confirmed zero callers anywhere in the repo before removing) rather than implementing them — the dispatch logic they'd have centralized already lives correctly at the two real call sites (`getToolsForMode()` and `continueSession`'s `category !== "backend"` check).

### Step 3 — ✅ done — `packages/tool-registry/src/tools/`: implement each category

No sandboxing prerequisite blocks this anymore (§4.3) and `git` isn't a separate file (§4.4), so each of the four remaining tool files below is independent of the others — **built one at a time, in whatever order is directed**, not as a fixed batch:

- ✅ `file-read.ts` — `list_directory`, `read_file`, `search_text`, `find_files` (§4.1) implemented. All four go through `resolveWorkspacePath` (§6.2) and `truncateOutput` (§6.4); `list_directory`/`search_text`/`find_files` use `fast-glob` with a shared `DEFAULT_IGNORE` (`node_modules`, `.git`, `.turbo`, `dist`, `build`, `.next`, `coverage`) so a real monorepo doesn't flood the output. `read_file` numbers lines (`cat -n` style, matching this harness's own read tool) and supports `offset`/`limit` for slicing large files; also guards file size (5MB) and rejects directories. `search_text` supports plain-substring or regex matching, catches malformed regexes cleanly, and skips unreadable/binary files per-file rather than failing the whole search. Verified end-to-end against the real repo (`bun -e`): non-recursive vs. recursive+maxDepth listing, offset/limit reads, missing file, path-escape attempt, offset-beyond-EOF, plain and invalid-regex search, no-matches case, glob find, and the no-`workspaceRoot` case — all returned the expected `ToolResult`.
- ✅ `file-update.ts` — `write_file`, `edit_file`, `delete_file` (§4.2) implemented, all `requiresConfirmation: true`. `write_file` creates missing parent directories and reports created-vs-overwrote; `edit_file` resolved open decision §9.1 by going with the find/replace shape (`{ path, oldText, newText, replaceAll? }`) — requires `oldText` to match exactly once unless `replaceAll` is set (same uniqueness convention as this harness's own edit tool), rejects a no-op `oldText === newText` call, and both reject with a clear message on a missing file rather than silently creating one (`write_file` is the creation path). `delete_file` only removes files, never directories. All three go through `resolveWorkspacePathOrError` (promoted from a local helper in `file-read.ts` into `lib/workspace-path.ts` itself once a second file needed the identical logic). Verified end-to-end against a scratch directory (not the real repo, since these mutate): create, overwrite, reject-writing-over-a-directory, path-escape, unique edit, ambiguous edit correctly rejected, `replaceAll`, oldText-not-found, no-op rejected, edit-on-missing-file, delete, delete-already-gone, reject-deleting-a-directory, and no-`workspaceRoot` — all 14 cases matched expectations.
- `process.ts` — already registered (`bash`); revisit only if a concrete gap shows up (e.g. wiring `cwd` through `resolveWorkspacePath`/`context.workspaceRoot`, which isn't done yet even though the helper exists).
- ✅ `user.ts` — `request_confirmation`, `ask_user` (§4.5) implemented. Each validates its args via its own zod schema (§6.1), returns `{ isError: true, ... }` — never throws — if `context.promptUser` isn't supplied or if a caller returns the wrong `UserPromptResult.kind` for what was asked, and otherwise just forwards to `context.promptUser(...)`: `request_confirmation` maps `{approved, reason}` to `content: "approved"` or `"declined: <reason>"`; `ask_user` maps `{answer}` straight to `content`. Neither sets `requiresConfirmation` — that flag is for gating *other* tools before they run, not for these two, which are themselves the gating mechanism. No `promptUser` implementation exists yet anywhere (CLI or otherwise) — verified with a fake one directly (`bun -e`): approve, decline-with-reason, bad-args, missing-handler, and options-based question all returned the expected `ToolResult` shape.
- ✅ `backend.ts` — `get_session_messages` (§4.6) implemented and registered in `builtInTools`, ahead of automatic compaction itself (which is fine — it doesn't depend on compaction ever having run, it just reads raw messages). `getMessages` supplied by `agent-session.controller.ts`'s `continueSession` for the one call site of `tool.execute()` on a `backend`-category tool. Verified with `turbo run typecheck` and a direct runtime test (`bun -e`) covering the happy path, an empty range, an invalid range, and a missing-handler case.

### Step 4 — ✅ already done — `apps/api`: supply the `backend`/`session` context

Nothing new to build here: this fell out as a side effect of Step 1 (the compile-fix for `execute`'s new required second parameter) and Step 3's `backend.ts` (which needed `getMessages`, not just `session.id`/`userId`), rather than being tackled as its own separate change.

- `continueSession`'s tool-result resolution branch (`agent-session.controller.ts`) supplies `{ session: { id: sessionId, userId, getMessages } }` as the `context` argument to `tool.execute()`, where `getMessages` is a closure over `prisma` (capped at 500 rows via `take`, per §4.6).
- Confirmed this is still the *only* call site of `.execute()` anywhere in `apps/api` (re-grepped), and it's still gated behind `if (tool.category !== "backend") return result` — so `workspaceRoot`/`promptUser` correctly never get supplied server-side; only `backend`-category tools ever read the `session` field, and today that's just `get_session_messages`.
- Verified by `turbo run typecheck` on `api` (clean) — and, in practice, already exercised by Step 3's `get_session_messages` runtime tests, since those tests are this exact code path.

### Step 5 — ✅ done — `apps/cli`: the client-side tool executor

Built independently (not by the work tracked in this doc — landed via `apps/cli/src/agent/{agent-loop,streamer,tool-runner}.ts` and the `ask`/`session` commands, committed on `main`) while this doc's Steps 1-4 were in progress. Noting it here so this doc doesn't go stale in the same way it was written to prevent: `@workspace/tool-registry`/`@workspace/protocol` are now real CLI dependencies, `resolveActiveWorkspaceRoot()` (`apps/cli/src/utils/workspace.ts`) resolves `workspaceRoot` from `config-store.ts`'s `workspaceRoots`, `promptUser` is implemented via `inquirer` in `tool-runner.ts`, and `requiresConfirmation` is checked before execution. Two real gaps found in it during a fresh repo-wide audit (see `docs/repo-audit-pending-and-bugs.md` for full detail, not duplicated here): `executeToolCalls`/`executeToolCall` take no `AbortSignal`, so a `SIGINT` during tool execution lets the results finish computing and then silently drops them instead of posting them back; and the `try/catch` around `tool.execute()` doesn't cover the `requiresConfirmation` prompt or the `workspaceRoot` resolution that happen just before it, so either throwing (e.g. `inquirer` in a non-TTY context) escapes uncaught and strands the session. Both are directly reachable today via a normal `ask` session that calls a `requiresConfirmation` tool — see `repo-audit-pending-and-bugs.md` Tier 0 #1 for the full writeup and fix direction.

### Step 6 — tests

- Unit tests per tool (path confinement rejects `../` escapes; `write_file` creates parent dirs or errors cleanly; `bash` still respects its timeout).
- One integration-style test of the full round trip: register a fake `backend` tool, drive `continueSession` with a `toolResults` payload naming it, assert the response is resolved server-side per §3/§4.6's contract.
- This slots into the staged build report's Stage 1.5 (currently zero test coverage anywhere in the repo) — good candidate for the first real test files in the monorepo, alongside the `agent-session.controller.ts` coverage already called for there.

---

## 8. Protocol/schema changes summary

For quick reference when implementing Step 1:

- `packages/protocol/src/tool-registry.ts`: add `ToolExecutionContext`, `UserPrompt`, `UserPromptResult`; add `requiresConfirmation?: boolean` to `ToolDefinition`; change `execute`'s signature to take `context` as a second parameter.
- No changes needed to `packages/protocol/src/agent-session.ts` (`ContinueSessionToolResultSchema` already carries `category`; the `content`/`isError` shape already matches §6.6's error contract).
- No changes needed to `packages/protocol/src/provider-registry.ts` (`ProviderToolDefinition`, `ProviderToolCall` are already correctly provider-facing and untouched by any of the above).

---

## 9. Open decisions (need a call before or during implementation)

Resolved since this section was first written: **no execution sandbox** (§4.3 — tools run directly against the real project directory, E2B/container isolation deferred) and **`git` folds into `bash`** (§4.4 — verified directly that every git operation, including worktree management, is just a shell command; no separate category or tool files).

Still open:

1. **`edit_file`'s exact shape** — simple `{ path, oldText, newText }` find/replace (cheap to implement, matches this harness's own editing tool) vs. a unified-diff/patch format (more expressive for multi-hunk edits, more implementation work, more ways for a model to produce a malformed patch). Recommendation is find/replace to start; a patch format is a reasonable later upgrade once the find/replace version is proven out.
2. **When does `backend`'s `get_session_messages` actually get registered** — this doc treats it as "build the shape now, wire it up when compaction ships" (§4.6); confirm that's the intended sequencing rather than needing it sooner for some other reason.
3. **`search_text` implementation** — plain Node recursive-read-and-regex to start, or reach for a `ripgrep` binding immediately. Recommendation is to start simple (fewer new dependencies, faster to ship) and only reach for `ripgrep` if it turns out to be a real performance problem on large workspaces.
