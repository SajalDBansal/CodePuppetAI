"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { getApiBaseUrl, parseErrorMessage } from "@/lib/api"

type Props = {
  redirectTo: string
}

const FIELDS = [
  { id: "name", label: "Name", type: "text", placeholder: "Ada Lovelace", autoComplete: "name" },
  { id: "email", label: "Email", type: "email", placeholder: "you@example.com", autoComplete: "email" },
  { id: "password", label: "Password", type: "password", placeholder: "••••••••", autoComplete: "new-password" },
  {
    id: "confirm",
    label: "Confirm password",
    type: "password",
    placeholder: "••••••••",
    autoComplete: "new-password",
  },
] as const

type FormState = Record<(typeof FIELDS)[number]["id"], string>

export function SignUpForm({ redirectTo }: Props) {
  const [form, setForm] = useState<FormState>({ name: "", email: "", password: "", confirm: "" })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  function set(key: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (form.name.trim().length < 2) return setError("Please enter your name.")
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError("Please enter a valid email address.")
    if (form.password.length < 8) return setError("Password must be at least 8 characters.")
    if (form.password !== form.confirm) return setError("Passwords do not match.")

    setError(null)
    setBusy(true)

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/v1/auth/sign-up/email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      })
      if (!response.ok) throw new Error(await parseErrorMessage(response))
      setDone(true)
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-up failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-page flex items-center justify-center py-16 md:py-24">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8">
        {done ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
            <h1 className="display-sm mt-4 text-foreground">Account created</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;re all set — sign in to continue as {form.email}.
            </p>
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
              className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="display-sm text-foreground">Create account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your keys stay yours — CodePuppet only uses credentials you save yourself.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-5">
              {FIELDS.map((field) => (
                <div key={field.id} className="space-y-2">
                  <label htmlFor={field.id} className="text-sm font-medium text-foreground">
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    name={field.id}
                    type={field.type}
                    autoComplete={field.autoComplete}
                    value={form[field.id]}
                    placeholder={field.placeholder}
                    onChange={(event) => set(field.id, event.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-background px-3.5 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
                  />
                </div>
              ))}

              {error ? <p className="text-sm text-destructive" role="status">{error}</p> : null}

              <button
                type="submit"
                disabled={busy}
                className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active disabled:opacity-60"
              >
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link
                href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
