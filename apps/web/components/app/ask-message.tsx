export function AssistantText({ content, streaming }: { content: string; streaming?: boolean }) {
    const blocks = content.split(/```/)
    return (
        <div className="space-y-3 text-sm leading-relaxed text-foreground">
            {blocks.map((block, i) =>
                i % 2 === 1 ? (
                    <pre
                        key={i}
                        className="overflow-x-auto rounded-md bg-surface-dark p-4 font-mono text-[13px] text-on-dark"
                    >
                        <code>{block.replace(/^[a-z]*\n/, "")}</code>
                    </pre>
                ) : (
                    block
                        .split(/\n{2,}/)
                        .filter((p) => p.trim())
                        .map((p, j) => (
                            <p key={`${i}-${j}`} className="whitespace-pre-wrap">
                                {p}
                            </p>
                        ))
                ),
            )}
            {streaming ? (
                <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-primary align-middle" />
            ) : null}
        </div>
    )
}

export function UserBubble({ content }: { content: string }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
                {content}
            </div>
        </div>
    )
}

export type ChatEntry =
    | { kind: "message"; id: string; role: "user" | "assistant"; content: string }
    | { kind: "activity"; id: string; label: string }

export function ActivityLine({ label }: { label: string }) {
    return (
        <div className="flex justify-center">
            <span className="rounded-full bg-surface-soft px-3 py-1 text-xs text-muted-foreground">{label}</span>
        </div>
    )
}
