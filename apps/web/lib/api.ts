export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_HOST ?? "http://localhost:3001"
}

export async function parseErrorMessage(response: Response): Promise<string> {
  const body = await response.json().catch(() => null)
  return body?.error?.message ?? body?.error_description ?? body?.message ?? "Request failed"
}

/** Only allow same-origin, absolute-path redirects to avoid an open redirect via `?redirect=`. */
export function sanitizeRedirect(target: string | undefined, fallback = "/ask"): string {
  if (!target) return fallback
  if (!target.startsWith("/") || target.startsWith("//")) return fallback
  return target
}
