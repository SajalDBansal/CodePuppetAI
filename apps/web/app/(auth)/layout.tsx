import { SiteLayout } from "@/components/site/layout"
import { ReactNode } from "react"

export default function AuthLayout({ children }: { children: ReactNode }) {
    return <SiteLayout>{children}</SiteLayout>
}
