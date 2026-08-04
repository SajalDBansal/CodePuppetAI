import { ReactNode } from "react"
import { headers } from "next/headers"
import { LoginRequired } from "@/components/site/login-required"
import { getSession } from "@/lib/session"
import { SiteLayout } from "@/components/site/layout"

/** Gates every page under this group behind authentication, so individual pages don't each re-check the session. */
export default async function MainLayout({ children }: { children: ReactNode }) {
  const user = await getSession()

  if (!user) {
    const headerList = await headers()
    const redirectTo = headerList.get("x-pathname") ?? "/"
    return (
      <SiteLayout>
        <LoginRequired redirectTo={redirectTo} />
      </SiteLayout>
    )
  }

  return <SiteLayout>{children}</SiteLayout>
}
