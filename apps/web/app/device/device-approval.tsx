"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@workspace/ui/components/button"
import { parseErrorMessage } from "@/lib/api"

type DeviceRequest = {
  status: string
  expiresAt: string
  deviceName: string | null
}

type Props = {
  apiBaseUrl: string
  initialCode: string
}

export function DeviceApproval({ apiBaseUrl, initialCode }: Props) {
  const router = useRouter()
  const [userCode, setUserCode] = useState(initialCode)
  const [deviceRequest, setDeviceRequest] = useState<DeviceRequest | null>(null)
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)

  async function reviewRequest(code: string) {
    const trimmed = code.trim()
    if (!trimmed) return

    setBusy(true)
    setMessage("")
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/device-login/verify?userCode=${encodeURIComponent(trimmed)}`,
        { credentials: "include" },
      )
      if (response.status === 401) {
        const redirectTo = `/device?user_code=${encodeURIComponent(trimmed)}`
        router.push(`/signin?redirect=${encodeURIComponent(redirectTo)}`)
        return
      }
      if (!response.ok) throw new Error(await parseErrorMessage(response))
      setDeviceRequest(await response.json())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed")
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (initialCode.trim()) void reviewRequest(initialCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function decide(decision: "approve" | "deny") {
    setBusy(true)
    setMessage("")
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/device-login/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: userCode.trim(), decision }),
      })
      if (!response.ok) throw new Error(await parseErrorMessage(response))
      setDeviceRequest(null)
      setMessage(decision === "approve" ? "Device approved. You can return to the CLI." : "Device request denied.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <section className="border-border bg-card w-full max-w-md rounded-xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Authorize CLI device</h1>
        <p className="text-muted-foreground mt-2 text-sm">Enter the code displayed by your CLI.</p>

        <label className="mt-6 block text-sm font-medium" htmlFor="user-code">
          Device code
        </label>
        <input
          id="user-code"
          value={userCode}
          onChange={(event) => setUserCode(event.target.value)}
          className="border-input bg-background mt-2 h-10 w-full rounded-md border px-3 font-mono uppercase"
          autoComplete="one-time-code"
          disabled={busy || Boolean(deviceRequest)}
        />

        {!deviceRequest && (
          <Button
            className="mt-4 h-10 w-full"
            onClick={() => void reviewRequest(userCode)}
            disabled={busy || !userCode.trim()}
          >
            {busy ? "Checking..." : "Review request"}
          </Button>
        )}

        {deviceRequest && (
          <div className="mt-6 space-y-4">
            <div className="bg-muted rounded-md p-4 text-sm">
              <p>
                <span className="font-medium">Device:</span> {deviceRequest.deviceName ?? "CodeAI CLI"}
              </p>
              <p>
                <span className="font-medium">Expires:</span> {new Date(deviceRequest.expiresAt).toLocaleString()}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="h-10 flex-1" onClick={() => decide("deny")} disabled={busy}>
                Deny
              </Button>
              <Button className="h-10 flex-1" onClick={() => decide("approve")} disabled={busy}>
                Approve
              </Button>
            </div>
          </div>
        )}

        {message && (
          <p className="text-muted-foreground mt-4 text-sm" role="status">
            {message}
          </p>
        )}
      </section>
    </main>
  )
}
