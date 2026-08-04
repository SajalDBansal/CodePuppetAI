import Link from "next/link"

export function LoginRequired({
    redirectTo,
    message = "You need to be signed in to view this page.",
}: {
    redirectTo: string
    message?: string
}) {
    return (
        <div className="container-page flex items-center justify-center py-16 md:py-24">
            <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center">
                <h1 className="display-sm text-foreground">Log in to continue</h1>
                <p className="mt-2 text-sm text-muted-foreground">{message}</p>
                <Link
                    href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
                    className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground"
                >
                    Log in
                </Link>
            </div>
        </div>
    )
}
