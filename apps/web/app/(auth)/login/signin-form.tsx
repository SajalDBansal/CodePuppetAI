"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getApiBaseUrl, parseErrorMessage } from "@/lib/api"

type Props = {
  redirectTo: string
}

export function SignInForm({ redirectTo }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/sign-in/email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
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
    <div className="container-page flex items-center justify-center py-16 md:py-24">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8">
        <h1 className="display-sm text-foreground">Log in</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Welcome back. Sign in to manage credentials and approve CLI logins.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <Link href="#" className="text-sm text-primary">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
              placeholder="••••••••"
            />
          </div>

          {error ? <p className="text-sm text-destructive" role="status">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Log in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href={`/signup?redirect=${encodeURIComponent(redirectTo)}`}
            className="text-primary underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
