import Link from "next/link"
import { getCredentials } from "@/lib/credentials"
import { getSessionDetail } from "@/lib/session-detail"
import { AskSessionPane } from "@/components/app/ask-session-pane"

export default async function AskSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
    const { sessionId } = await params
    const [session, credentials] = await Promise.all([getSessionDetail(sessionId), getCredentials()])

    if (!session) {
        return (
            <div className="flex flex-1 items-center justify-center px-6 text-center">
                <div>
                    <h1 className="display-sm text-foreground">Session not found</h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        It may have been removed.{" "}
                        <Link href="/ask" className="text-primary">
                            Start a new chat
                        </Link>
                        .
                    </p>
                </div>
            </div>
        )
    }

    return <AskSessionPane session={session} credentials={credentials} />
}
