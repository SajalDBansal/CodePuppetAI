import Link from "next/link"
import { SiteLayout } from "@/components/site/layout"
import { getApiBaseUrl } from "@/lib/api"
import { getSession } from "@/lib/session"
import { DeviceApproval } from "./device-approval"

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string | string[] }>
}) {
  const query = await searchParams
  const initialCode = Array.isArray(query.user_code) ? query.user_code[0] : query.user_code
  const user = await getSession()

  if (!user) {
    const redirectTarget = initialCode ? `/device?user_code=${encodeURIComponent(initialCode)}` : "/device"
    return (
      <div className="container-page flex items-center justify-center py-16 md:py-24">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="display-sm text-foreground">Log in to continue</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            You need to be signed in to approve a CLI device login.
          </p>
          <Link
            href={`/login?redirect=${encodeURIComponent(redirectTarget)}`}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground"
          >
            Log in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <DeviceApproval apiBaseUrl={getApiBaseUrl()} initialCode={initialCode ?? ""} userEmail={user.email} />
  )
}
