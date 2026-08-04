import { cookies } from "next/headers"
import { getApiBaseUrl } from "./api"

export type SessionSummary = {
  id: string
  providerId: string
  modelId: string
  title: string | null
  status: string
  createdAt: string
  updatedAt: string
  lastMessageAt: string
}

/** Server-only: forwards the incoming request's cookies to the auth gateway to list the user's agent sessions. */
export async function getSessions(): Promise<SessionSummary[]> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  if (!cookieHeader) return []

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/agent-session`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    })
    if (!response.ok) return []
    return (await response.json()) as SessionSummary[]
  } catch {
    return []
  }
}
