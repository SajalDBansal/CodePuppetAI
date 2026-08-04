"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react"
import {
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
    Dialog,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@workspace/ui/components/dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@workspace/ui/components/select"
import { ProviderBadge } from "@/components/app/bits"
import { getApiBaseUrl, parseErrorMessage } from "@/lib/api"
import type { CatalogProvider } from "@/lib/catalog"
import type { Credential } from "@/lib/credentials"
import { formatDate, relativeTime } from "@/lib/format"

function AddCredentialDialog({
    open,
    onOpenChange,
    providers,
    onSaved,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    providers: CatalogProvider[]
    onSaved: () => void
}) {
    const [providerId, setProviderId] = useState(providers[0]?.providerId ?? "")
    const [label, setLabel] = useState("default")
    const [key, setKey] = useState("")
    const [show, setShow] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    async function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!providerId) {
            setError("Choose a provider.")
            return
        }
        if (key.trim().length < 8) {
            setError("Paste the full API key from your provider dashboard.")
            return
        }

        setError(null)
        setBusy(true)
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/v1/credentials`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ providerId, label: label.trim() || "default", apiKey: key.trim() }),
            })
            if (!response.ok) throw new Error(await parseErrorMessage(response))
            setLabel("default")
            setKey("")
            onOpenChange(false)
            onSaved()
        } catch (error) {
            setError(error instanceof Error ? error.message : "Could not save credential")
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog isOpen={open} onOpenChange={onOpenChange} className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle className="display-sm">Add credential</DialogTitle>
                <DialogDescription>
                    Keys are write-only — after saving, this key can never be read back.
                </DialogDescription>
            </DialogHeader>

            {/* <div className="font-bold text-lg">
                hello
            </div> */}

            <form onSubmit={save} className="space-y-2">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Provider</label>
                    <Select value={providerId} onChange={(key) => setProviderId(String(key))}>
                        <SelectTrigger className="mt-2">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {providers.map((p) => (
                                <SelectItem key={p.providerId} id={p.providerId}>
                                    {p.displayName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <label htmlFor="label" className="text-sm font-medium text-foreground">
                        Label
                    </label>
                    <input
                        id="label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="default"
                        className="h-10 w-full rounded-md border border-border bg-background px-3.5 font-mono text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 mt-2"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="apikey" className="text-sm font-medium text-foreground">
                        API key
                    </label>
                    <div className="relative mt-2">
                        <input
                            id="apikey"
                            type={show ? "text" : "password"}
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder="sk-…"
                            className="h-10 w-full rounded-md border border-border bg-background px-3.5 pr-11 font-mono text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                        />
                        <button
                            type="button"
                            aria-label={show ? "Hide API key" : "Show API key"}
                            onClick={() => setShow((v) => !v)}
                            className="absolute top-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                        >
                            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Encrypted with AES-256-GCM before it touches the database. Decrypted only in memory,
                        right before a request to the provider.
                    </p>
                </div>

                {error ? <p className="text-sm text-destructive" role="status">{error}</p> : null}

                <DialogFooter>
                    <button
                        type="submit"
                        disabled={busy}
                        className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active disabled:opacity-60"
                    >
                        {busy ? "Saving…" : "Save credential"}
                    </button>
                </DialogFooter>
            </form>
        </Dialog>
    )
}

export function CredentialsClient({
    initialCredentials,
    providers,
}: {
    initialCredentials: Credential[]
    providers: CatalogProvider[]
}) {
    const router = useRouter()
    const [credentials, setCredentials] = useState(initialCredentials)
    const [addOpen, setAddOpen] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<string | null>(null)
    const [wipeOpen, setWipeOpen] = useState(false)
    const [busy, setBusy] = useState(false)

    function refresh() {
        router.refresh()
    }

    async function removeOne(credentialId: string) {
        setBusy(true)
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/v1/credentials/${credentialId}`, {
                method: "DELETE",
                credentials: "include",
            })
            if (!response.ok && response.status !== 204) throw new Error(await parseErrorMessage(response))
            setCredentials((current) => current.filter((c) => c.id !== credentialId))
            refresh()
        } finally {
            setBusy(false)
            setPendingDelete(null)
        }
    }

    async function removeAll() {
        setBusy(true)
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/v1/credentials`, {
                method: "DELETE",
                credentials: "include",
            })
            if (!response.ok) throw new Error(await parseErrorMessage(response))
            setCredentials([])
            refresh()
        } finally {
            setBusy(false)
            setWipeOpen(false)
        }
    }

    return (
        <>
            <div className="container-page py-14 md:py-20">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="display-md text-foreground">Credentials</h1>
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                            Your provider API keys, encrypted at rest. Nothing is ever shared or reused across
                            users.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active"
                    >
                        <Plus className="h-4 w-4" /> Add credential
                    </button>
                </div>

                {credentials.length === 0 ? (
                    <div className="mt-12 flex justify-center">
                        <div className="w-full max-w-md rounded-lg border border-border bg-card p-10 text-center">
                            <KeyRound className="mx-auto h-6 w-6 text-primary" />
                            <h2 className="mt-4 text-lg font-medium text-foreground">
                                Add your first API key to start a session
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground">
                                CodePuppet runs on your own provider keys — nothing works until one is saved.
                            </p>
                            <button
                                type="button"
                                onClick={() => setAddOpen(true)}
                                className="mt-6 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground"
                            >
                                <Plus className="h-4 w-4" /> Add credential
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mt-10 overflow-hidden rounded-lg border border-border bg-card">
                            <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_auto] gap-4 border-b border-border px-5 py-3 caption-upper text-muted-foreground md:grid">
                                <span>Provider</span>
                                <span>Label</span>
                                <span>Last used</span>
                                <span>Created</span>
                                <span className="w-8" />
                            </div>
                            {credentials.map((c) => (
                                <div
                                    key={c.id}
                                    className="grid grid-cols-1 gap-2 border-b border-border px-5 py-4 last:border-b-0 md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-center md:gap-4"
                                >
                                    <ProviderBadge providerId={c.providerId} />
                                    <span className="font-mono text-sm text-foreground">{c.label}</span>
                                    <span className="text-sm text-muted-foreground">
                                        {relativeTime(c.lastUsedAt)}
                                    </span>
                                    <span className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</span>
                                    <button
                                        type="button"
                                        aria-label={`Delete ${c.providerId} credential ${c.label}`}
                                        onClick={() => setPendingDelete(c.id)}
                                        className="inline-flex h-8 w-8 items-center justify-center justify-self-start rounded-md text-muted-foreground hover:bg-muted hover:text-destructive md:justify-self-end"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="mt-4 text-right">
                            <button
                                type="button"
                                onClick={() => setWipeOpen(true)}
                                className="text-sm text-destructive underline-offset-4 hover:underline"
                            >
                                Remove all credentials
                            </button>
                        </div>
                    </>
                )}
            </div>

            <AddCredentialDialog open={addOpen} onOpenChange={setAddOpen} providers={providers} onSaved={refresh} />

            <AlertDialogContent
                isOpen={pendingDelete !== null}
                onOpenChange={(v) => !v && setPendingDelete(null)}
            >
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove this credential?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Sessions using it will need a different key.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        isDisabled={busy}
                        onPress={() => {
                            if (pendingDelete) void removeOne(pendingDelete)
                        }}
                    >
                        Remove
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>

            <AlertDialogContent isOpen={wipeOpen} onOpenChange={setWipeOpen}>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove every saved key?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This deletes all credentials on your account for every provider. Any session that
                        relies on them will stop working until you add a new key. This cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        isDisabled={busy}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onPress={() => void removeAll()}
                    >
                        Remove all
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </>
    )
}
