"use client"

import { FormEvent, useState } from "react"
import { HelpCircle } from "lucide-react"
import type { PendingPrompt, PromptAnswer } from "@/lib/run-agent-turn"

export function PromptCard({ prompt, onAnswer }: { prompt: PendingPrompt; onAnswer: (answer: PromptAnswer) => void }) {
    const [text, setText] = useState("")

    function submitText(event: FormEvent) {
        event.preventDefault()
        if (!text.trim()) return
        onAnswer({ kind: "question", answer: text.trim() })
    }

    return (
        <div className="mx-auto max-w-2xl rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-start gap-2.5">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                    {prompt.kind === "confirmation" ? (
                        <>
                            <p className="text-sm font-medium text-foreground">{prompt.prompt}</p>
                            {prompt.detail ? (
                                <p className="mt-1 text-sm text-muted-foreground">{prompt.detail}</p>
                            ) : null}
                            <div className="mt-3 flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => onAnswer({ kind: "confirmation", approved: true })}
                                    className="h-8 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active"
                                >
                                    Approve
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onAnswer({ kind: "confirmation", approved: false })}
                                    className="h-8 rounded-md border border-border bg-background px-3.5 text-sm font-medium text-foreground hover:bg-muted"
                                >
                                    Decline
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-sm font-medium text-foreground">{prompt.question}</p>
                            {prompt.options && prompt.options.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {prompt.options.map((option) => (
                                        <button
                                            key={option}
                                            type="button"
                                            onClick={() => onAnswer({ kind: "question", answer: option })}
                                            className="h-8 rounded-md border border-border bg-background px-3.5 text-sm font-medium text-foreground hover:bg-muted"
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <form onSubmit={submitText} className="mt-3 flex gap-2">
                                    <input
                                        autoFocus
                                        value={text}
                                        onChange={(event) => setText(event.target.value)}
                                        placeholder="Type your answer…"
                                        className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!text.trim()}
                                        className="h-9 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active disabled:opacity-40"
                                    >
                                        Send
                                    </button>
                                </form>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
