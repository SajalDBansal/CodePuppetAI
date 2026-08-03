import type { Metadata } from "next";
import { InstallSnippet } from "@/components/site/code-block";
import { GITHUB_URL } from "@/lib/constants";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Details — CodePuppet",
    description:
        "How CodePuppet works: architecture, the agent session lifecycle, authentication, credential security, tools, and the tech stack.",
};

const STACK: Array<[string, string]> = [
    ["Language", "TypeScript everywhere"],
    ["Runtime / package manager", "Bun, Node.js ≥ 20"],
    ["Monorepo tooling", "Turborepo, Bun workspaces"],
    ["Backend framework", "Express 4"],
    ["Database", "PostgreSQL + Prisma ORM"],
    [
        "Auth",
        "better-auth — email/password, bearer tokens, admin plugin, OAuth-style device-authorization plugin",
    ],
    ["Validation", "Zod v4"],
    ["LLM providers", "OpenAI, Anthropic, Google (Gemini) — via a shared streaming adapter interface"],
    ["Frontend", "Next.js (App Router), React, Tailwind, shadcn/ui"],
    ["CLI", "Commander, Inquirer, Axios, Chalk"],
    ["Testing", "Jest"],
    ["Infra", "Docker Compose (Postgres for local dev)"],
];

const ARCHITECTURE = [
    {
        title: "CLI — developer's machine",
        body: "Runs agent sessions locally and talks to the API over HTTPS with a bearer token. Executes file, process, git and user tools in your workspace.",
        dark: false,
    },
    {
        title: "Web app — browser",
        body: "Sign-in, sign-up, and device approval only. Talks to the API over HTTPS with a cookie session.",
        dark: false,
    },
    {
        title: "API server — Express",
        body: "Auth (better-auth), controllers (agent-session, credential, catalog, admin), provider registry, tool registry, and the AES-256-GCM credential vault.",
        dark: true,
    },
    {
        title: "Postgres — via Prisma",
        body: "Stores users, sessions, interactions, turns, messages, and the encrypted provider API keys.",
        dark: true,
    },
    {
        title: "Provider APIs",
        body: "The provider registry calls out to the real OpenAI, Anthropic, and Google APIs using the decrypted per-user key.",
        dark: false,
    },
];


export default function Details() {
    return (
        <>
            <div className="container-page py-14 md:py-20">
                <span className="caption-upper text-muted-foreground">Details</span>
                <h1 className="display-lg mt-4 max-w-3xl text-foreground">
                    A self-hosted agent runtime, built around your own API keys.
                </h1>
            </div>

            <div className="container-page pb-16">
                <Section title="What it does">
                    <p>CodePuppet lets a user:</p>
                    <OrderedList
                        items={[
                            "Create an account and store their own LLM provider API key (OpenAI, Anthropic, or Google), encrypted per-user on the backend — the backend never uses a shared or global key.",
                            "Start an agent session against a chosen provider/model, streamed back token-by-token over Server-Sent Events (SSE).",
                            "Let the model call tools mid-conversation. Some tools (reading a file, running a shell command in the developer's own workspace) are executed by the CLI on the user's machine; backend-category tools are executed by the API server itself. Tool results are fed back into the same conversation to continue the turn.",
                            "Log the CLI into their account via a device-authorization flow — type a short code, approve it from the browser, no pasting long tokens into a terminal.",
                        ]}
                    />
                    <p>
                        The whole system is intentionally “bring your own key”: the server stores and uses only
                        credentials the authenticated user has explicitly saved.
                    </p>
                </Section>

                <Section title="Architecture">
                    <div className="grid gap-4 md:grid-cols-2">
                        {ARCHITECTURE.map((box) => (
                            <div
                                key={box.title}
                                className={
                                    "rounded-lg p-8 " +
                                    (box.dark ? "bg-surface-dark" : "border border-border bg-surface-card")
                                }
                            >
                                <h3
                                    className={
                                        "text-lg font-medium " + (box.dark ? "text-on-dark" : "text-foreground")
                                    }
                                >
                                    {box.title}
                                </h3>
                                <p
                                    className={
                                        "mt-2 text-sm leading-relaxed " +
                                        (box.dark ? "text-on-dark-soft" : "text-muted-foreground")
                                    }
                                >
                                    {box.body}
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="overflow-x-auto rounded-lg bg-surface-dark-soft p-6">
                        <pre className="font-mono text-[13px] leading-relaxed text-on-dark-soft">{`CLI (your machine) ──HTTPS + bearer──┐
                                     ├──▶ API server (Express) ──▶ Postgres (Prisma)
Web app (browser) ──HTTPS + cookie───┘            │
                                                  └──▶ OpenAI / Anthropic / Google`}</pre>
                    </div>
                </Section>

                <Section title="Tech stack">
                    <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full min-w-[520px] text-left text-sm">
                            <thead className="bg-surface-card">
                                <tr>
                                    <th className="px-5 py-3 font-medium text-foreground">Layer</th>
                                    <th className="px-5 py-3 font-medium text-foreground">Technology</th>
                                </tr>
                            </thead>
                            <tbody>
                                {STACK.map(([layer, tech]) => (
                                    <tr key={layer} className="border-t border-border">
                                        <td className="px-5 py-3 font-medium text-foreground">{layer}</td>
                                        <td className="px-5 py-3 text-muted-foreground">{tech}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>

                <Section title="How an agent session works">
                    <OrderedList
                        items={[
                            "Client sends a message plus the chosen provider, model, and credential to the API.",
                            "The API validates the model/provider and credential, creates a session and interaction, and streams a request to the LLM provider using the decrypted API key.",
                            "As the provider streams back text and tool calls, the API forwards every event to the client immediately over SSE.",
                            "Once the stream finishes, everything — the turn, resulting messages, updated session state — is persisted to Postgres in a single transaction.",
                            "If the model asked to use a tool, the client (or the server, for backend-only tools) executes it and sends the result back to continue the same interaction. This repeats until the model produces a final answer with no pending tool calls.",
                        ]}
                    />
                    <ul className="space-y-2">
                        <li>
                            <span className="font-medium text-foreground">Session</span> — one conversation,
                            pinned to a provider/model, owned by a user.
                        </li>
                        <li>
                            <span className="font-medium text-foreground">Interaction</span> — one logical message
                            exchange within a session; can span multiple turns if the model calls tools.
                        </li>
                        <li>
                            <span className="font-medium text-foreground">Turn</span> — one actual
                            request/response round-trip to the LLM provider (records input/output token counts).
                        </li>
                        <li>
                            <span className="font-medium text-foreground">Message</span> — every user message,
                            assistant message, and tool result, in one strictly-ordered, replayable log per
                            session.
                        </li>
                    </ul>
                </Section>

                <Section title="Authentication">
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-border bg-surface-card p-8">
                            <h3 className="text-lg font-medium text-foreground">Web — sign-up / sign-in</h3>
                            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                                Standard email and password, with a session cookie issued by better-auth.
                            </p>
                        </div>
                        <div className="rounded-lg border border-border bg-surface-card p-8">
                            <h3 className="text-lg font-medium text-foreground">CLI — device authorization</h3>
                            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                                <li>CLI requests a device code from the API.</li>
                                <li>API returns a short user code and a verification URL.</li>
                                <li>CLI prints: “Go to this URL and enter code XXXX-XXXX.”</li>
                                <li>Developer opens the URL, signs in if needed, and approves the request.</li>
                                <li>CLI polls in the background and receives a bearer access token once approved.</li>
                                <li>Every future CLI request carries that token; the CLI stores it locally.</li>
                            </ol>
                        </div>
                    </div>
                </Section>

                <Section title="Credential security">
                    <p>
                        Provider API keys are never stored in plaintext and never read from a shared config
                        value. Each user's key is:
                    </p>
                    <OrderedList
                        items={[
                            "Encrypted with AES-256-GCM, using a per-user key derived via HKDF-SHA256 from a single master key.",
                            "Bound to the specific user, provider, and label, so a ciphertext can't be decrypted under a different user/provider/label than it was written for.",
                            "Decrypted only in-memory, immediately before a provider call is made.",
                        ]}
                    />
                </Section>

                <Section title="Tools & providers">
                    <ul className="space-y-4">
                        <li>
                            <span className="font-medium text-foreground">Provider registry</span> — one adapter
                            per LLM provider (OpenAI, Anthropic, Google), each speaking a shared internal
                            streaming protocol, so the rest of the system never has to know which provider it's
                            talking to.
                        </li>
                        <li>
                            <span className="font-medium text-foreground">Tool registry</span> — tool definitions
                            with a name, category, and JSON-schema input. Categories (
                            <span className="font-mono text-sm">file-read</span>,{" "}
                            <span className="font-mono text-sm">file-update</span>,{" "}
                            <span className="font-mono text-sm">process</span>,{" "}
                            <span className="font-mono text-sm">user</span>,{" "}
                            <span className="font-mono text-sm">backend</span>) determine where a tool runs:
                            everything except <span className="font-mono text-sm">backend</span> runs on the
                            developer's own machine via the CLI (git included — every git operation is just a{" "}
                            <span className="font-mono text-sm">process</span> shell command, no separate
                            category); backend tools run on the API server itself.
                        </li>
                        <li>
                            <span className="font-medium text-foreground">Modes</span> — every interaction runs in
                            one of four modes, and the mode is what decides which tool categories the model is
                            even offered:{" "}
                            <span className="font-mono text-sm">Ask</span> (no tools, answer only),{" "}
                            <span className="font-mono text-sm">Plan</span> (read files, no writes),{" "}
                            <span className="font-mono text-sm">Code</span> and{" "}
                            <span className="font-mono text-sm">Auto</span> (full read/write/process/user access).
                        </li>
                    </ul>
                </Section>

                <Section title="Project status">
                    <div className="rounded-lg bg-primary p-8 text-primary-foreground">
                        <span className="caption-upper">Status</span>
                        <p className="mt-3 text-base leading-relaxed">
                            Actively under development — Google and OpenAI provider streaming work end-to-end
                            today; Anthropic support is currently a stub.
                        </p>
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-6 inline-flex h-10 items-center rounded-md bg-background px-5 text-sm font-medium text-foreground"
                        >
                            Latest status on GitHub
                        </a>
                    </div>
                </Section>

                <Section title="Get started">
                    <InstallSnippet />
                    <div className="flex flex-wrap gap-3">
                        <a
                            href={GITHUB_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground"
                        >
                            View on GitHub
                        </a>
                        <Link
                            href="/signup"
                            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active"
                        >
                            Create an account
                        </Link>
                    </div>
                </Section>
            </div>
        </>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode; }) {
    return (
        <section className="border-t border-border py-14 first:border-t-0 md:py-20">
            <h2 className="display-md text-foreground">{title}</h2>
            <div className="mt-6 space-y-5 text-base leading-relaxed text-muted-foreground">
                {children}
            </div>
        </section>
    );
}

function OrderedList({ items }: { items: React.ReactNode[] }) {
    return (
        <ol className="space-y-3">
            {items.map((item, i) => (
                <li key={i} className="flex gap-4">
                    <span className="mt-0.5 font-mono text-sm text-primary">{String(i + 1).padStart(2, "0")}</span>
                    <span className="flex-1">{item}</span>
                </li>
            ))}
        </ol>
    );
}