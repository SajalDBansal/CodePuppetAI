"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@workspace/ui/components/select"
import { Composer } from "./ask-composer"
import { ActivityLine, AssistantText, UserBubble, type ChatEntry } from "./ask-message"
import { PromptCard } from "./ask-prompt-card"
import { startAgentTurn, continueAgentTurnWithToolResults, type ThinkingLevel } from "@/lib/agent-stream"
import { runAgentTurn, type PendingPrompt, type PromptAnswer } from "@/lib/run-agent-turn"
import type { CatalogProvider } from "@/lib/catalog"
import type { Credential } from "@/lib/credentials"

export function AskNewPane({ providers, credentials }: { providers: CatalogProvider[]; credentials: Credential[] }) {
    const router = useRouter()
    const [providerId, setProviderId] = useState(providers[0]?.providerId ?? "")
    const provider = providers.find((p) => p.providerId === providerId)
    const [modelId, setModelId] = useState(provider?.models[0]?.modelId ?? "")
    const providerCreds = credentials.filter((c) => c.providerId === providerId)
    const [credentialLabel, setCredentialLabel] = useState(providerCreds[0]?.label ?? "")
    const [thinking, setThinking] = useState<ThinkingLevel>("MID")

    const [entries, setEntries] = useState<ChatEntry[]>([])
    const [streamText, setStreamText] = useState<string | null>(null)
    const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null)
    const [error, setError] = useState<string | null>(null)
    const busy = entries.length > 0
    const promptResolverRef = useRef<((answer: PromptAnswer) => void) | null>(null)

    function changeProvider(next: string) {
        setProviderId(next)
        const nextProvider = providers.find((p) => p.providerId === next)
        setModelId(nextProvider?.models[0]?.modelId ?? "")
        setCredentialLabel(credentials.find((c) => c.providerId === next)?.label ?? "")
    }

    function onPromptUser(prompt: PendingPrompt): Promise<PromptAnswer> {
        return new Promise((resolve) => {
            promptResolverRef.current = resolve
            setPendingPrompt(prompt)
        })
    }

    function answerPrompt(answer: PromptAnswer) {
        setPendingPrompt(null)
        promptResolverRef.current?.(answer)
        promptResolverRef.current = null
    }

    async function send(text: string) {
        if (!providerId || !modelId || !credentialLabel) return

        setEntries([{ kind: "message", id: "user-0", role: "user", content: text }])
        setError(null)
        setStreamText("")

        try {
            const sessionId = await runAgentTurn(
                () =>
                    startAgentTurn({
                        providerId,
                        modelId,
                        credentialLabel,
                        message: text,
                        thinkingLevel: thinking,
                        title: text.slice(0, 48),
                    }),
                (sid, toolResults) => continueAgentTurnWithToolResults(sid, { credentialLabel, toolResults }),
                {
                    onTextDelta: setStreamText,
                    onTurnTextDone: (fullText) => {
                        setStreamText(null)
                        setEntries((current) => [
                            ...current,
                            { kind: "message", id: `assistant-${current.length}`, role: "assistant", content: fullText },
                        ])
                    },
                    onToolActivity: (label) => {
                        setEntries((current) => [...current, { kind: "activity", id: `activity-${current.length}`, label }])
                    },
                    onPromptUser,
                    onError: setError,
                },
            )

            router.push(`/ask/${sessionId}`)
            router.refresh()
        } catch (error) {
            setError(error instanceof Error ? error.message : "Something went wrong — try again.")
            setStreamText(null)
        }
    }

    if (busy) {
        return (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
                    <div className="mx-auto max-w-2xl space-y-6">
                        {entries.map((entry) =>
                            entry.kind === "activity" ? (
                                <ActivityLine key={entry.id} label={entry.label} />
                            ) : entry.role === "user" ? (
                                <UserBubble key={entry.id} content={entry.content} />
                            ) : (
                                <AssistantText key={entry.id} content={entry.content} />
                            ),
                        )}
                        {streamText !== null ? <AssistantText content={streamText} streaming /> : null}
                        {pendingPrompt ? <PromptCard prompt={pendingPrompt} onAnswer={answerPrompt} /> : null}
                        {error ? (
                            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {error}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center px-6 py-10">
            <h1 className="display-md text-center text-foreground">What are we working on?</h1>
            <p className="mt-2 text-center text-sm text-muted-foreground">
                Ask mode — the model can read earlier session context and ask you questions; file edits, shell, and
                git run in the CLI on your own machine.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
                <Select value={providerId} onChange={(key) => changeProvider(String(key))}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {providers.map((p) => (
                            <SelectItem key={p.providerId} id={p.providerId} className="hover:font-bold">
                                {p.displayName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={modelId} onChange={(key) => setModelId(String(key))}>
                    <SelectTrigger className="w-[210px] font-mono text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(provider?.models ?? []).map((m) => (
                            <SelectItem key={m.modelId} id={m.modelId} className="font-mono text-xs">
                                {m.modelId}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {providerCreds.length > 0 ? (
                    <Select
                        value={credentialLabel}
                        onChange={(key) => setCredentialLabel(String(key))}
                        placeholder="Credential"
                    >
                        <SelectTrigger className="w-[170px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {providerCreds.map((c) => (
                                <SelectItem key={c.id} id={c.label}>
                                    {c.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <Link href="/credentials" className="text-sm text-primary underline-offset-4 hover:underline">
                        No credentials for this provider — add one
                    </Link>
                )}
            </div>

            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

            <div className="mt-4">
                <Composer
                    autoFocus
                    thinking={thinking}
                    onThinkingChange={setThinking}
                    onSend={send}
                    disabled={providerCreds.length === 0}
                    placeholder={
                        providerCreds.length === 0
                            ? "Add a credential for this provider to start"
                            : "Ask about your codebase…"
                    }
                />
            </div>
        </div>
    )
}


const items = [
    { label: "Apple", value: "apple" },
    { label: "Banana", value: "banana" },
    { label: "Blueberry", value: "blueberry" },
    { label: "Grapes", value: "grapes" },
    { label: "Pineapple", value: "pineapple" },
]

export function SelectDemo() {
    return (
        <Select placeholder="Select a fruit" className="w-full max-w-48">
            <SelectTrigger>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectGroup>
                    <SelectLabel>Fruits</SelectLabel>
                    {items.map((item) => (
                        <SelectItem key={item.value} id={item.value}>
                            {item.label}
                        </SelectItem>
                    ))}
                </SelectGroup>
            </SelectContent>
        </Select>
    )
}
