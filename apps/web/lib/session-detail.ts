import { cookies } from "next/headers"
import { getApiBaseUrl } from "./api"
import type { UsageStats, ModelUsage, ProviderUsage } from "./usage"

export type SessionMessage = {
  id: string
  sequence: number
  turnId: string | null
  role: "SYSTEM" | "USER" | "ASSISTANT" | "TOOL"
  content: string | null
  toolCalls: unknown
  toolCallId: string | null
  name: string | null
  isError: boolean | null
  createdAt: string
}

export type SessionInteraction = {
  id: string
  sequence: number
  mode: string
  thinkingLevel: string
  status: string
  inputTokens: number
  outputTokens: number
  startedAt: string
  completedAt: string | null
  messages: SessionMessage[]
}

export type SessionDetail = {
  id: string
  userId: string
  providerId: string
  modelId: string
  title: string | null
  systemPrompt: string | null
  status: string
  createdAt: string
  updatedAt: string
  lastMessageAt: string
  interactions: SessionInteraction[]
  usage: {
    total: UsageStats
    byModels: Record<string, ModelUsage>
    byProviders: Record<string, ProviderUsage>
  }
}

/** Server-only: forwards the incoming request's cookies to fetch one session's full history. Returns null on 404 or when signed out. */
export async function getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  if (!cookieHeader) return null

  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1/agent-session/${sessionId}`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    })
    if (!response.ok) return null
    return (await response.json()) as SessionDetail
  } catch {
    return null
  }
}
