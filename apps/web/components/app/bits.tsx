import { cn } from "@workspace/ui/lib/utils"

const PROVIDER_LABELS: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
}

const PROVIDER_TONE: Record<string, string> = {
    anthropic: "bg-primary/12 text-primary border-primary/25",
    openai: "bg-teal/15 text-foreground border-teal/40",
    google: "bg-amber/18 text-foreground border-amber/45",
}

const DEFAULT_PROVIDER_TONE = "bg-muted text-muted-foreground border-border"

/** Providers come from the admin-managed catalog, so this is a display hint, not an exhaustive map — unknown ids fall back to the raw id. */
export function providerName(providerId: string): string {
    return PROVIDER_LABELS[providerId] ?? providerId
}

export function ProviderBadge({
    providerId,
    model,
    className,
}: {
    providerId: string
    model?: string
    className?: string
}) {
    return (
        <span className={cn("inline-flex items-center gap-1.5", className)}>
            <span
                className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px]",
                    PROVIDER_TONE[providerId] ?? DEFAULT_PROVIDER_TONE,
                )}
            >
                {providerName(providerId)}
            </span>
            {model ? <span className="font-mono text-[11px] text-muted-foreground">{model}</span> : null}
        </span>
    )
}

export function StatusPill({ status }: { status: string }) {
    const active = status.toUpperCase() === "ACTIVE"
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                active
                    ? "border-success/30 bg-success/10 text-foreground"
                    : "border-border bg-muted text-muted-foreground",
            )}
        >
            <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-success" : "bg-muted-foreground")} />
            {active ? "Active" : "Archived"}
        </span>
    )
}
