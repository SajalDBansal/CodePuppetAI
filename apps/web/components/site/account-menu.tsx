"use client"

import { BarChart3, KeyRound, LogOut, MessagesSquare } from "lucide-react";
import { useRouter } from "next/navigation";

import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { getApiBaseUrl } from "@/lib/api";

function initials(name: string) {
    return name
        .split(/[\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join("");
}

export function AccountMenu({ name, email, onNavigate, }: {
    name: string;
    email: string;
    onNavigate?: () => void;
}) {
    const router = useRouter();

    async function signOut() {
        await fetch(`${getApiBaseUrl()}/api/v1/user/logout`, {
            method: "POST",
            credentials: "include",
        });
        router.push("/");
        router.refresh();
    }

    function go(href: string) {
        onNavigate?.();
        router.push(href);
    }

    return (
        <DropdownMenuTrigger>
            <button
                type="button"
                aria-label="Account menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-card text-xs font-medium text-foreground"
            >
                {initials(name) || "?"}
            </button>
            <DropdownMenu placement="bottom end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                    <div className="text-sm font-medium text-foreground">{name}</div>
                    <div className="truncate text-xs text-muted-foreground">{email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onAction={() => go("/sessions")}>
                    <MessagesSquare className="h-4 w-4" /> Sessions
                </DropdownMenuItem>
                <DropdownMenuItem onAction={() => go("/credentials")}>
                    <KeyRound className="h-4 w-4" /> Credentials
                </DropdownMenuItem>
                <DropdownMenuItem onAction={() => go("/usage")}>
                    <BarChart3 className="h-4 w-4" /> Usage
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    onAction={() => {
                        void signOut();
                        onNavigate?.();
                    }}
                >
                    <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
            </DropdownMenu>
        </DropdownMenuTrigger>
    );
}
