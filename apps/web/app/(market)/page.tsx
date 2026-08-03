import { redirect } from "next/navigation";
import { InstallSnippet } from "@/components/site/code-block";
import { GITHUB_URL } from "@/lib/constants";
import { getSession } from "@/lib/session";
import { ArrowRight, GitBranch, KeyRound, Radio, Terminal } from "lucide-react";
import Link from "next/link";

const FEATURES = [
  {
    icon: KeyRound,
    title: "Bring your own key",
    body: "Your OpenAI, Anthropic, or Google key — encrypted per user, never shared.",
  },
  {
    icon: GitBranch,
    title: "Real tool use",
    body: "The agent reads and writes files, runs shell commands, and uses git in your workspace.",
  },
  {
    icon: Radio,
    title: "Streamed, turn-by-turn",
    body: "Every response streams token-by-token over Server-Sent Events.",
  },
  {
    icon: Terminal,
    title: "One CLI login",
    body: "Device-code login: type a short code, approve it in the browser. No pasted tokens.",
  },
];

export default async function Page() {
  const user = await getSession();
  if (user) {
    redirect("/ask");
  }

  return (
    <>
      <section className="container-page py-16 md:py-24">
        <div className="max-w-3xl">
          <span className="inline-flex items-center rounded-full bg-surface-card px-3 py-1 text-[13px] font-medium text-foreground">
            Self-hosted · bring your own key
          </span>
          <h1 className="display-xl mt-6 text-foreground">
            Run AI coding agents against your own codebase, on your own keys.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
            A self-hosted platform for multi-turn AI coding sessions with real tool use — file
            edits, shell commands, git — backed by the API key you already pay for (OpenAI,
            Anthropic, or Google). Nothing shared, nothing stored you didn't choose to store.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
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
              Get Started
            </Link>
          </div>
        </div>
      </section>

      <section className="container-page pb-16 md:pb-24">
        <h2 className="display-md mb-6 text-foreground">Install the CLI</h2>
        <InstallSnippet />
      </section>

      <section className="bg-surface-soft py-16 md:py-24">
        <div className="container-page grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg bg-surface-card p-8">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 text-lg font-medium text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-page py-16 text-center md:py-24">
        <p className="mx-auto max-w-xl text-lg text-muted-foreground">
          Curious about the architecture, the credential vault, and how a session actually runs?
        </p>
        <Link
          href="/details"
          className="mt-4 inline-flex items-center gap-2 text-base font-medium text-primary underline-offset-4 hover:underline"
        >
          See how it works <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </>
  )
}
