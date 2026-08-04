export function sessionTitle(session: { title: string | null; id: string }): string {
  return session.title?.trim() || `Session ${session.id.slice(0, 8)}`
}

export function formatTokens(tokens: number): string {
  return Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(tokens)
}

export function formatCost(cost: number): string {
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: cost > 0 && cost < 0.01 ? 4 : 2,
  }).format(cost)
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value))
}

const RELATIVE_DIVISIONS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
]

export function relativeTime(value: string | Date | null): string {
  if (!value) return "Never"

  const diffSeconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)

  for (const [unit, secondsInUnit] of RELATIVE_DIVISIONS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(
        Math.round(diffSeconds / secondsInUnit),
        unit,
      )
    }
  }
  return "Just now"
}
