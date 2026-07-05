export function shortId(value: string): string {
    return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

export function formatDate(value: string | Date | null): string {
    if (!value) return "—"
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value))
}

export function formatNumber(value: number): string {
    return new Intl.NumberFormat().format(value)
}
