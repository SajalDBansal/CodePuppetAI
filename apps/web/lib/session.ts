import { cookies } from "next/headers"
import { getApiBaseUrl } from "./api"

export type SessionUser = {
  id: string
  name: string
  email: string
  role: string
}

/** Server-only: forwards the incoming request's cookies to the auth gateway to resolve the current user. */
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  if (!cookieHeader) return null

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/user/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    })
    if (!response.ok) return null
    const body = (await response.json()) as { user: SessionUser }
    return body.user
  } catch {
    return null
  }
}
