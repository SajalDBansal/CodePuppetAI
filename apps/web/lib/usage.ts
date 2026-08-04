import { cookies } from "next/headers"
import { getApiBaseUrl } from "./api"

export type UsageStats = {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  reasoningTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
}

export type ModelUsage = UsageStats & { providerId: string; modelId: string }
export type ProviderUsage = UsageStats & { providerId: string }

export type SessionUsage = {
  sessionId: string
  title: string | null
  status: string
  createdAt: string
  lastMessageAt: string
  total: UsageStats
  byModels: Record<string, ModelUsage>
  byProviders: Record<string, ProviderUsage>
}

export type UsageResponse = {
  userId: string
  total: UsageStats
  byModels: Record<string, ModelUsage>
  byProviders: Record<string, ProviderUsage>
  sessions: SessionUsage[]
}

/** Server-only: forwards the incoming request's cookies to the auth gateway to load usage/cost totals. */
export async function getUsage(): Promise<UsageResponse | null> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  if (!cookieHeader) return null

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/agent-session/usage`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    })
    if (!response.ok) return null
    return (await response.json()) as UsageResponse
  } catch {
    return null
  }
}
