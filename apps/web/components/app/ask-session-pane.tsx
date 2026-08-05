"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ProviderBadge, StatusPill } from "@/components/app/bits"
import { Composer } from "./ask-composer"
import { ActivityLine, AssistantText, UserBubble, type ChatEntry } from "./ask-message"
import { PromptCard } from "./ask-prompt-card"
import { continueAgentTurn, continueAgentTurnWithToolResults, type ThinkingLevel } from "@/lib/agent-stream"
import { runAgentTurn, type PendingPrompt, type PromptAnswer } from "@/lib/run-agent-turn"
import { formatCost, formatTokens, sessionTitle } from "@/lib/format"
import type { SessionDetail } from "@/lib/session-detail"
import type { Credential } from "@/lib/credentials"

function flattenMessages(session: SessionDetail): ChatEntry[] {
    return session.interactions
        .flatMap((interaction) => interaction.messages)
        .filter((m): m is typeof m & { content: string } => Boolean(m.content) && (m.role === "USER" || m.role === "ASSISTANT"))
        .map((m) => ({ kind: "message", id: m.id, role: m.role === "USER" ? "user" : "assistant", content: m.content }))
}

export function AskSessionPane({ session, credentials }: { session: SessionDetail; credentials: Credential[] }) {
    const router = useRouter()
    const [entries, setEntries] = useState<ChatEntry[]>(() => flattenMessages(session))
    const [streamText, setStreamText] = useState<string | null>(null)
    const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [thinking, setThinking] = useState<ThinkingLevel>("MID")
    const scrollRef = useRef<HTMLDivElement>(null)
    const promptResolverRef = useRef<((answer: PromptAnswer) => void) | null>(null)

    const archived = session.status === "ARCHIVED"
    const credentialLabel = credentials.find((c) => c.providerId === session.providerId)?.label
    const busy = streamText !== null || pendingPrompt !== null

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
    }, [entries.length, streamText, pendingPrompt])

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
        if (!credentialLabel) {
            setError("No credential saved for this session's provider.")
            return
        }

        setEntries((current) => [...current, { kind: "message", id: `user-${Date.now()}`, role: "user", content: text }])
        setError(null)
        setStreamText("")

        try {
            await runAgentTurn(
                () => continueAgentTurn(session.id, { credentialLabel, message: text, thinkingLevel: thinking }),
                (sid, toolResults) => continueAgentTurnWithToolResults(sid, { credentialLabel, toolResults }),
                {
                    onTextDelta: setStreamText,
                    onTurnTextDone: (fullText) => {
                        setStreamText(null)
                        setEntries((current) => [
                            ...current,
                            { kind: "message", id: `assistant-${Date.now()}`, role: "assistant", content: fullText },
                        ])
                    },
                    onToolActivity: (label) => {
                        setEntries((current) => [...current, { kind: "activity", id: `activity-${Date.now()}`, label }])
                    },
                    onPromptUser,
                    onError: setError,
                },
            )

            setStreamText(null)
            router.refresh()
        } catch (error) {
            setError(error instanceof Error ? error.message : "Something went wrong — try again.")
            setStreamText(null)
        }
    }

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
                <span className="truncate text-sm font-medium text-foreground">{sessionTitle(session)}</span>
                <ProviderBadge providerId={session.providerId} model={session.modelId} />
                <StatusPill status={session.status} />
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {formatTokens(session.usage.total.totalTokens)} tokens · {formatCost(session.usage.total.totalCost)}
                </span>
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
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

            <div className="border-t border-border px-6 py-4">
                <div className="mx-auto max-w-2xl">
                    {archived ? (
                        <p className="rounded-md border border-border bg-surface-soft px-4 py-3 text-sm text-muted-foreground">
                            This session is archived and read-only.
                        </p>
                    ) : (
                        <Composer autoFocus disabled={busy} thinking={thinking} onThinkingChange={setThinking} onSend={send} />
                    )}
                </div>
            </div>
        </div>
    )
}
