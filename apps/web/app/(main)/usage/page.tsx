import { ProviderBadge } from "@/components/app/bits"
import { formatCost, formatTokens } from "@/lib/format"
import { getUsage } from "@/lib/usage"

export default async function UsagePage() {
    const usage = await getUsage()
    const total = usage?.total ?? null
    const byModels = usage ? Object.values(usage.byModels).sort((a, b) => b.totalCost - a.totalCost) : []
    const byCost = usage ? [...usage.sessions].sort((a, b) => b.total.totalCost - a.total.totalCost) : []

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const sessionsThisMonth = usage?.sessions.filter((s) => new Date(s.createdAt) >= monthStart).length ?? 0

    const tiles = [
        { label: "Total tokens", value: formatTokens(total?.totalTokens ?? 0) },
        { label: "Total cost", value: formatCost(total?.totalCost ?? 0) },
        { label: "Sessions this month", value: String(sessionsThisMonth) },
    ]

    return (
        <>
            <div className="container-page py-14 md:py-20">
                <h1 className="display-md text-foreground">Usage</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    What you&apos;ve spent against your own provider keys. CodePuppet never bills you — this is
                    your provider&apos;s meter.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                    {tiles.map((t) => (
                        <div key={t.label} className="rounded-lg border border-border bg-card p-6">
                            <p className="caption-upper text-muted-foreground">{t.label}</p>
                            <p className="mt-3 font-mono text-3xl text-foreground">{t.value}</p>
                        </div>
                    ))}
                </div>

                <h2 className="display-sm mt-14 text-foreground">By provider and model</h2>
                <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
                    <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-4 border-b border-border px-5 py-3 caption-upper text-muted-foreground">
                        <span>Model</span>
                        <span className="text-right">Tokens in</span>
                        <span className="text-right">Tokens out</span>
                        <span className="text-right">Cost</span>
                    </div>
                    {byModels.length === 0 ? (
                        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                            No usage yet — start a session from the CLI to see it here.
                        </p>
                    ) : (
                        byModels.map((r) => (
                            <div
                                key={`${r.providerId}:${r.modelId}`}
                                className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center gap-4 border-b border-border px-5 py-3.5 last:border-b-0"
                            >
                                <span className="min-w-0">
                                    <ProviderBadge providerId={r.providerId} model={r.modelId} />
                                </span>
                                <span className="text-right font-mono text-sm text-muted-foreground">
                                    {formatTokens(r.inputTokens)}
                                </span>
                                <span className="text-right font-mono text-sm text-muted-foreground">
                                    {formatTokens(r.outputTokens)}
                                </span>
                                <span className="text-right font-mono text-sm text-foreground">
                                    {formatCost(r.totalCost)}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                <h2 className="display-sm mt-14 text-foreground">Most expensive sessions</h2>
                <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
                    {byCost.length === 0 ? (
                        <p className="px-5 py-8 text-center text-sm text-muted-foreground">No sessions yet.</p>
                    ) : (
                        byCost.map((s) => {
                            const model = Object.values(s.byModels)[0]
                            return (
                                <div
                                    key={s.sessionId}
                                    className="grid grid-cols-1 gap-2 border-b border-border px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto] md:items-center md:gap-4"
                                >
                                    <span className="truncate text-sm font-medium text-foreground">
                                        {s.title ?? "Untitled session"}
                                    </span>
                                    {model ? (
                                        <ProviderBadge providerId={model.providerId} model={model.modelId} />
                                    ) : (
                                        <span className="text-sm text-muted-foreground">—</span>
                                    )}
                                    <span className="font-mono text-xs text-muted-foreground md:text-right">
                                        {formatTokens(s.total.totalTokens)} tokens · {formatCost(s.total.totalCost)}
                                    </span>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </>
    )
}
