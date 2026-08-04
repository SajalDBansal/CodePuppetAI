"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@workspace/ui/components/select"
import { ProviderBadge, StatusPill } from "@/components/app/bits"
import { formatTokens, formatCost, relativeTime, sessionTitle } from "@/lib/format"
import type { CatalogProvider } from "@/lib/catalog"
import type { SessionSummary } from "@/lib/sessions"

type Row = SessionSummary & {
    usage: { inputTokens: number; outputTokens: number; totalTokens: number; totalCost: number }
}

export function SessionsTable({ sessions, providers }: { sessions: Row[]; providers: CatalogProvider[] }) {
    const [status, setStatus] = useState("all")
    const [provider, setProvider] = useState("all")
    const [query, setQuery] = useState("")

    const rows = useMemo(
        () =>
            sessions
                .filter((s) => (status === "all" ? true : s.status.toUpperCase() === status))
                .filter((s) => (provider === "all" ? true : s.providerId === provider))
                .filter((s) =>
                    query.trim() ? sessionTitle(s).toLowerCase().includes(query.trim().toLowerCase()) : true,
                )
                .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
        [sessions, status, provider, query],
    )

    return (
        <>
            <div className="mt-8 flex flex-wrap items-center gap-3">
                <Select value={status} onChange={(key) => setStatus(String(key))}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem id="all">All statuses</SelectItem>
                        <SelectItem id="ACTIVE">Active</SelectItem>
                        <SelectItem id="ARCHIVED">Archived</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={provider} onChange={(key) => setProvider(String(key))}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem id="all">All providers</SelectItem>
                        {providers.map((p) => (
                            <SelectItem key={p.providerId} id={p.providerId}>
                                {p.displayName}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="relative min-w-[220px] flex-1">
                    <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search titles"
                        aria-label="Search sessions"
                        className="h-10 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                    />
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="mt-12 rounded-lg border border-border bg-card p-12 text-center">
                    <p className="text-sm text-muted-foreground">
                        No sessions yet — start one from the{" "}
                        <Link href="/ask" className="text-primary">
                            Ask page
                        </Link>
                        .
                    </p>
                </div>
            ) : (
                <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
                    {rows.map((s) => (
                        <div
                            key={s.id}
                            className="grid grid-cols-1 gap-2 border-b border-border px-5 py-4 text-left last:border-b-0 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto_auto_auto] md:items-center md:gap-4"
                        >
                            <span className="truncate text-sm font-medium text-foreground">{sessionTitle(s)}</span>
                            <ProviderBadge providerId={s.providerId} model={s.modelId} />
                            <StatusPill status={s.status} />
                            <span className="text-sm text-muted-foreground md:text-right">
                                {relativeTime(s.lastMessageAt)}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground md:text-right">
                                {formatTokens(s.usage.totalTokens)} tokens · {formatCost(s.usage.totalCost)}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}
