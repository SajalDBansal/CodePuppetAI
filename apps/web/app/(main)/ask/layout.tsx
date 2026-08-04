import { ReactNode } from "react"
import { getSessions } from "@/lib/sessions"
import { AskShell } from "@/components/app/ask-shell"

export default async function AskLayout({ children }: { children: ReactNode }) {
    const sessions = await getSessions()

    return <AskShell sessions={sessions}>{children}</AskShell>
}
