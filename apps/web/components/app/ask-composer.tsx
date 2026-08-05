"use client"

import { FormEvent, useEffect, useRef, useState } from "react"
import { ArrowUp } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import type { ThinkingLevel } from "@/lib/agent-stream"

const THINKING: Array<{ id: ThinkingLevel; label: string }> = [
    { id: "INSTANT", label: "Instant" },
    { id: "MID", label: "Mid" },
    { id: "HIGH", label: "High" },
]

export function ThinkingControl({ value, onChange }: { value: ThinkingLevel; onChange: (v: ThinkingLevel) => void }) {
    return (
        <div className="inline-flex rounded-md border border-border bg-surface-soft p-0.5">
            {THINKING.map((t) => (
                <button
                    key={t.id}
                    type="button"
                    onClick={() => onChange(t.id)}
                    className={cn(
                        "rounded-[5px] px-3 py-1 text-xs font-medium transition-colors",
                        value === t.id
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                    )}
                >
                    {t.label}
                </button>
            ))}
        </div>
    )
}

export function Composer({
    disabled,
    thinking,
    onThinkingChange,
    onSend,
    autoFocus,
    placeholder = "Ask about your codebase…",
}: {
    disabled?: boolean
    thinking: ThinkingLevel
    onThinkingChange: (v: ThinkingLevel) => void
    onSend: (text: string) => void
    autoFocus?: boolean
    placeholder?: string
}) {
    const [text, setText] = useState("")
    const ref = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        if (!disabled && autoFocus) ref.current?.focus()
    }, [disabled, autoFocus])

    function submit(event: FormEvent) {
        event.preventDefault()
        const value = text.trim()
        if (!value || disabled) return
        setText("")
        onSend(value)
    }

    return (
        <form onSubmit={submit} className="rounded-xl border border-border bg-card p-2.5">
            <textarea
                ref={ref}
                rows={3}
                value={text}
                disabled={disabled}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) submit(event)
                }}
                placeholder={placeholder}
                className="w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3 pt-1">
                <ThinkingControl value={thinking} onChange={onThinkingChange} />
                <button
                    type="submit"
                    disabled={disabled || !text.trim()}
                    aria-label="Send message"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary-active disabled:opacity-40"
                >
                    <ArrowUp className="h-4 w-4" />
                </button>
            </div>
        </form>
    )
}
