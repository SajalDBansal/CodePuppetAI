"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import { getApiBaseUrl, parseErrorMessage } from "@/lib/api"

type Props = {
  redirectTo: string
}

export function SignInForm({ redirectTo }: Props) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")

    const data = new FormData(event.currentTarget)
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/sign-in/email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      })
      if (!response.ok) throw new Error(await parseErrorMessage(response))
      router.push(redirectTo)
      router.refresh()
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in failed")
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <section className="border-border bg-card w-full max-w-md rounded-xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-muted-foreground mt-2 text-sm">Sign in to your account to continue.</p>

        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            autoComplete="email"
            className="border-input bg-background h-10 w-full rounded-md border px-3"
          />
          <input
            name="password"
            type="password"
            required
            placeholder="Password"
            autoComplete="current-password"
            className="border-input bg-background h-10 w-full rounded-md border px-3"
          />
          <Button type="submit" className="h-10 w-full" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </Button>
        </form>

        {error && (
          <p className="text-destructive mt-4 text-sm" role="status">
            {error}
          </p>
        )}

        <p className="text-muted-foreground mt-6 text-sm">
          Don&apos;t have an account?{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href={`/signup?redirect=${encodeURIComponent(redirectTo)}`}
          >
            Sign up
          </Link>
        </p>
      </section>
    </main>
  )
}
