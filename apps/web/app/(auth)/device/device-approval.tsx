"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, XCircle } from "lucide-react"
import { parseErrorMessage } from "@/lib/api"

type DeviceRequest = {
  status: string
  expiresAt: string
  deviceName: string | null
}

type Props = {
  apiBaseUrl: string
  initialCode: string
  userEmail: string
}

const CODE_RE = /^[A-Z0-9]{8}$/

export function DeviceApproval({ apiBaseUrl, initialCode, userEmail }: Props) {
  const router = useRouter()
  const [code, setCode] = useState(initialCode)
  const [deviceRequest, setDeviceRequest] = useState<DeviceRequest | null>(null)
  const [result, setResult] = useState<"approved" | "denied" | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function reviewRequest(rawCode: string) {
    const normalized = rawCode.trim().toUpperCase()
    if (!CODE_RE.test(normalized)) {
      setError("Enter the code exactly as shown in your terminal (XXXX-XXXX).")
      return
    }

    setBusy(true)
    setError("")
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/device-login/verify?userCode=${encodeURIComponent(normalized)}`,
        { credentials: "include" },
      )
      if (response.status === 401) {
        router.push(`/login?redirect=${encodeURIComponent(`/device?user_code=${normalized}`)}`)
        return
      }
      if (!response.ok) throw new Error(await parseErrorMessage(response))
      setCode(normalized)
      setDeviceRequest(await response.json())
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (initialCode.trim()) void reviewRequest(initialCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSubmitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void reviewRequest(code)
  }

  async function decide(decision: "approve" | "deny") {
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/device-login/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: code, decision }),
      })
      if (!response.ok) throw new Error(await parseErrorMessage(response))
      setResult(decision === "approve" ? "approved" : "denied")
    } catch (error) {
      setError(error instanceof Error ? error.message : "Request failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container-page flex items-center justify-center py-16 md:py-24">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8">
        {result ? (
          <div className="text-center">
            {result === "approved" ? (
              <CheckCircle2 className="mx-auto h-8 w-8 text-success" />
            ) : (
              <XCircle className="mx-auto h-8 w-8 text-destructive" />
            )}
            <h1 className="display-sm mt-4 text-foreground">
              {result === "approved" ? "Device approved" : "Request denied"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You can close this tab and return to your terminal.
            </p>
          </div>
        ) : deviceRequest ? (
          <div>
            <h1 className="display-sm text-foreground">Approve CLI login</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A CLI on your machine wants to sign in as{" "}
              <span className="font-medium text-foreground">{userEmail}</span>.
            </p>
            <div className="mt-5 rounded-md bg-surface-card px-4 py-3 text-center font-mono text-base tracking-[0.2em] text-foreground">
              {code}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => void decide("approve")}
                disabled={busy}
                className="h-10 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => void decide("deny")}
                disabled={busy}
                className="h-10 flex-1 rounded-md border border-border bg-background text-sm font-medium text-foreground disabled:opacity-60"
              >
                Deny
              </button>
            </div>
            {error ? <p className="mt-3 text-sm text-destructive" role="status">{error}</p> : null}
          </div>
        ) : (
          <form onSubmit={onSubmitCode}>
            <h1 className="display-sm text-foreground">Enter device code</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Type the code your terminal is showing, e.g. <span className="font-mono">WXYZ-1234</span>.
            </p>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              maxLength={9}
              aria-label="Device code"
              disabled={busy}
              className="mt-6 h-12 w-full rounded-md border border-border bg-background text-center font-mono text-lg tracking-[0.25em] outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15"
            />
            {error ? <p className="mt-3 text-sm text-destructive" role="status">{error}</p> : null}
            <button
              type="submit"
              disabled={busy || !code.trim()}
              className="mt-6 h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-active disabled:opacity-60"
            >
              {busy ? "Checking…" : "Continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
