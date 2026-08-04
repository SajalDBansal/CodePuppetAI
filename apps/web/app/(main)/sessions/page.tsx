import Link from "next/link"
import { Plus } from "lucide-react"
import { getProviders } from "@/lib/catalog"
import { getSessions } from "@/lib/sessions"
import { getUsage } from "@/lib/usage"
import { SessionsTable } from "./sessions-table"

export default async function SessionsPage() {
    const [sessions, usage, providers] = await Promise.all([getSessions(), getUsage(), getProviders()])

    const usageBySession = new Map(usage?.sessions.map((s) => [s.sessionId, s.total]) ?? [])

    const rows = sessions.map((session) => ({
        ...session,
        usage: usageBySession.get(session.id) ?? {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            totalCost: 0,
        },
    }))

    return (
        <div className="container-page py-14 md:py-20">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="display-md text-foreground">Sessions</h1>
                    <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                        Every agent session on your account, newest activity first.
                    </p>
                </div>
                <Link
                    href="/ask"
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active"
                >
                    <Plus className="h-4 w-4" /> New chat
                </Link>
            </div>

            <SessionsTable sessions={rows} providers={providers} />
        </div>
    )
}
