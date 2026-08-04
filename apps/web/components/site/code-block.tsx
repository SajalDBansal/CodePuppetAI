"use client"
import { Check, Copy } from "lucide-react";
import { useState } from "react";

const COMMANDS: Record<string, string> = {
    npm: "npm install -g code-puppet",
    bun: "bun add -g code-puppet",
    pnpm: "pnpm add -g code-puppet",
    yarn: "yarn global add code-puppet",
};

export function InstallSnippet() {
    const [tab, setTab] = useState<keyof typeof COMMANDS>("npm");
    const [copied, setCopied] = useState(false);

    const command = COMMANDS[tab] ?? COMMANDS['npm']!;

    async function copy() {
        await navigator.clipboard.writeText(command);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
    }

    return (
        <div className="overflow-hidden rounded-lg bg-surface-dark p-6">
            <div className="flex flex-wrap items-center gap-1">
                {(Object.keys(COMMANDS) as Array<keyof typeof COMMANDS>).map((key) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={
                            "rounded-md px-3 py-1.5 font-mono text-[13px] transition-colors " +
                            (tab === key
                                ? "bg-surface-dark-elevated text-on-dark"
                                : "text-on-dark-soft hover:text-on-dark")
                        }
                    >
                        {key}
                    </button>
                ))}
            </div>
            <div className="mt-4 flex items-center gap-3 overflow-x-auto rounded-md bg-surface-dark-soft px-4 py-3">
                <span className="select-none font-mono text-sm text-primary">$</span>
                <code className="whitespace-pre font-mono text-sm text-on-dark">{command}</code>
                <button
                    type="button"
                    onClick={copy}
                    aria-label="Copy install command"
                    className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-dark-elevated text-on-dark-soft"
                >
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </button>
            </div>
            <p className="mt-3 text-sm text-on-dark-soft">
                Requires Node.js 20+. Then run <span className="font-mono">code-puppet login</span>.
            </p>
        </div>
    );
}