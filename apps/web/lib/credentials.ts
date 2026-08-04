import { cookies } from "next/headers"
import { getApiBaseUrl } from "./api"

export type Credential = {
  id: string
  providerId: string
  label: string
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

/** Server-only: forwards the incoming request's cookies to the auth gateway to list the user's saved credentials. */
export async function getCredentials(): Promise<Credential[]> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  if (!cookieHeader) return []

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/credentials`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    })
    if (!response.ok) return []
    const body = (await response.json()) as { credentials: Credential[] }
    return body.credentials
  } catch {
    return []
  }
}
