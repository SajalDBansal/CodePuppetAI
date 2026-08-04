import { ReactNode } from "react";
import { GITHUB_URL } from "@/lib/constants";
import { getSession } from "@/lib/session";
import { SpikeMark } from "./logo";
import { SiteNav } from "./site-nav";

function SiteFooter() {
    return (
        <footer className="mt-auto bg-surface-dark py-12">
            <div className="container-page flex flex-col gap-6 text-sm text-on-dark-soft md:flex-row md:items-center md:justify-between">
                <span className="inline-flex items-center gap-2 text-on-dark">
                    <SpikeMark className="h-3.5 w-3.5" />
                    <span className="font-display text-lg">CodePuppet</span>
                </span>
                <div className="flex flex-wrap items-center gap-6">
                    <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-on-dark">
                        GitHub
                    </a>
                    <span>MIT License</span>
                    <span>© {new Date().getFullYear()} CodePuppet</span>
                </div>
            </div>
        </footer>
    );
}

export async function SiteLayout({ children }: { children: ReactNode }) {
    const user = await getSession();

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <SiteNav user={user} />
            <main className="flex-1">{children}</main>
            <SiteFooter />
        </div>
    );
}
