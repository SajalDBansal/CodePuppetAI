"use client"
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { Wordmark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { AccountMenu } from "./account-menu";
import type { SessionUser } from "@/lib/session";

const NAV_LINKS = [
    { href: "/", label: "Home" },
    { href: "/details", label: "Details" },
];

function NavLink({
    href,
    onNavigate,
    children,
}: {
    href: string;
    onNavigate?: () => void;
    children: ReactNode;
}) {
    const pathname = usePathname();
    const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

    return (
        <Link
            href={href}
            onClick={onNavigate}
            className={cn(
                "text-sm font-medium transition-colors hover:text-foreground",
                active ? "text-foreground" : "text-muted-foreground"
            )}
        >
            {children}
        </Link>
    );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
    return (
        <>
            {NAV_LINKS.map((link) => (
                <NavLink key={link.href} href={link.href} onNavigate={onNavigate}>
                    {link.label}
                </NavLink>
            ))}
        </>
    );
}

export function SiteNav({ user }: { user: SessionUser | null }) {
    const [open, setOpen] = useState(false);

    return (
        <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
            <div className="container-page flex h-16 items-center justify-between gap-6">
                <Link href="/" className="shrink-0">
                    <Wordmark />
                </Link>

                <nav className="hidden items-center gap-6 md:flex">
                    <NavLinks />
                </nav>

                <div className="hidden items-center gap-3 md:flex">
                    <ThemeToggle />
                    {user ? (
                        <>
                            <Link
                                href="/ask"
                                className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active"
                            >
                                Ask
                            </Link>
                            <AccountMenu name={user.name} email={user.email} />
                        </>
                    ) : (
                        <>
                            <Link href="/login" className="text-sm font-medium text-foreground">
                                Login
                            </Link>
                            <Link
                                href="/signup"
                                className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active"
                            >
                                Sign Up
                            </Link>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2 md:hidden">
                    <ThemeToggle />
                    <button
                        type="button"
                        aria-label="Toggle menu"
                        onClick={() => setOpen((v) => !v)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border"
                    >
                        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            {open ? (
                <div className="border-t border-border bg-background md:hidden">
                    <div className="container-page flex flex-col gap-4 py-6">
                        <NavLinks onNavigate={() => setOpen(false)} />
                        {user ? (
                            <div className="flex items-center gap-3">
                                <Link
                                    href="/ask"
                                    onClick={() => setOpen(false)}
                                    className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
                                >
                                    Ask
                                </Link>
                                <AccountMenu
                                    name={user.name}
                                    email={user.email}
                                    onNavigate={() => setOpen(false)}
                                />
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <Link
                                    href="/login"
                                    onClick={() => setOpen(false)}
                                    className="rounded-md border border-border px-5 py-2.5 text-sm font-medium"
                                >
                                    Login
                                </Link>
                                <Link
                                    href="/signup"
                                    onClick={() => setOpen(false)}
                                    className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
                                >
                                    Sign Up
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </header>
    );
}
