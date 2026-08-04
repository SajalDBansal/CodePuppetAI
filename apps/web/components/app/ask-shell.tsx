"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
    BarChart3,
    KeyRound,
    MessagesSquare,
    PanelLeftClose,
    PanelLeftOpen,
    Plus,
} from "lucide-react"
import { SheetContent, SheetHeader, SheetTitle } from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"
import { sessionTitle, relativeTime } from "@/lib/format"
import type { SessionSummary } from "@/lib/sessions"

function groupSessions(sessions: SessionSummary[]) {
    const now = Date.now()
    const buckets: Array<{ label: string; items: SessionSummary[] }> = [
        { label: "Today", items: [] },
        { label: "Yesterday", items: [] },
        { label: "Previous 7 days", items: [] },
        { label: "Older", items: [] },
    ]
    for (const s of [...sessions].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))) {
        const days = (now - new Date(s.lastMessageAt).getTime()) / 86_400_000
        const idx = days < 1 ? 0 : days < 2 ? 1 : days < 7 ? 2 : 3
        buckets[idx]!.items.push(s)
    }
    return buckets.filter((b) => b.items.length > 0)
}

const QUICK_LINKS = [
    { href: "/sessions", label: "All sessions", icon: MessagesSquare },
    { href: "/credentials", label: "Credentials", icon: KeyRound },
    { href: "/usage", label: "Usage", icon: BarChart3 },
]

function SidebarBody({ sessions, activeId, onNavigate }: { sessions: SessionSummary[]; activeId?: string; onNavigate?: () => void }) {
    const groups = useMemo(() => groupSessions(sessions), [sessions])

    return (
        <div className="flex h-full flex-col">
            <div className="p-3">
                <Link
                    href="/ask"
                    onClick={onNavigate}
                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active"
                >
                    <Plus className="h-4 w-4" /> New chat
                </Link>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-4">
                {groups.length === 0 ? (
                    <p className="px-2 py-6 text-sm text-muted-foreground">No sessions yet.</p>
                ) : (
                    groups.map((g) => (
                        <div key={g.label} className="mt-4 first:mt-0">
                            <p className="px-2 caption-upper text-muted-foreground">{g.label}</p>
                            <div className="mt-1.5 space-y-0.5">
                                {g.items.map((s) => (
                                    <Link
                                        key={s.id}
                                        href={`/ask/${s.id}`}
                                        onClick={onNavigate}
                                        className={cn(
                                            "block rounded-md px-2 py-2 transition-colors",
                                            s.id === activeId ? "bg-surface-card" : "hover:bg-surface-card/60",
                                        )}
                                    >
                                        <span className="block truncate text-sm text-foreground">{sessionTitle(s)}</span>
                                        <span className="mt-0.5 flex items-center gap-2 truncate font-mono text-[11px] text-muted-foreground">
                                            {s.modelId}
                                            <span className="font-sans">· {relativeTime(s.lastMessageAt)}</span>
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div className="border-t border-border p-2">
                {QUICK_LINKS.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        onClick={onNavigate}
                        className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-surface-card/60 hover:text-foreground"
                    >
                        <link.icon className="h-4 w-4" />
                        {link.label}
                    </Link>
                ))}
            </div>
        </div>
    )
}

export function AskShell({ sessions, children }: { sessions: SessionSummary[]; children: React.ReactNode }) {
    const pathname = usePathname()
    const activeId = pathname.startsWith("/ask/") ? pathname.slice("/ask/".length) : undefined

    const [collapsed, setCollapsed] = useState(false)
    const [mobileOpen, setMobileOpen] = useState(false)

    return (
        <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
            <aside
                className={cn(
                    "hidden shrink-0 flex-col overflow-hidden border-r border-border bg-surface-soft transition-[width] duration-150 md:flex",
                    collapsed ? "w-0 border-r-0" : "w-[280px]",
                )}
            >
                <div className="w-[280px]">
                    <SidebarBody sessions={sessions} activeId={activeId} />
                </div>
            </aside>

            <SheetContent isOpen={mobileOpen} onOpenChange={setMobileOpen} side="left" className="w-[280px] p-0">
                <SheetHeader className="border-b border-border p-3">
                    <SheetTitle>Sessions</SheetTitle>
                </SheetHeader>
                <div className="min-h-0 flex-1">
                    <SidebarBody sessions={sessions} activeId={activeId} onNavigate={() => setMobileOpen(false)} />
                </div>
            </SheetContent>

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <button
                        type="button"
                        aria-label="Open sessions"
                        onClick={() => setMobileOpen(true)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                    >
                        <PanelLeftOpen className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        aria-label={collapsed ? "Show sessions" : "Hide sessions"}
                        onClick={() => setCollapsed((v) => !v)}
                        className="hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex"
                    >
                        {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </button>
                </div>
                {children}
            </div>
        </div>
    )
}
