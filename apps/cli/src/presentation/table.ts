export type TableValue = string | number | boolean | null | undefined

export function renderTable(headers: string[], rows: TableValue[][]): string {
  if (headers.length === 0) return ""
  const values = rows.map((row) =>
    headers.map((_, index) => formatValue(row[index]))
  )
  const widths = headers.map((header, index) =>
    Math.max(
      visibleLength(header),
      ...values.map((row) => visibleLength(row[index] ?? ""))
    )
  )
  const border = (left: string, middle: string, right: string) =>
    `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`
  const line = (row: string[]) =>
    `│ ${row.map((value, index) => pad(value, widths[index] ?? 0)).join(" │ ")} │`

  return [
    border("┌", "┬", "┐"),
    line(headers),
    border("├", "┼", "┤"),
    ...values.map(line),
    border("└", "┴", "┘"),
  ].join("\n")
}

function formatValue(value: TableValue): string {
  if (value === null || value === undefined || value === "") return "—"
  return String(value).replaceAll("\n", " ")
}

function pad(value: string, width: number): string {
  return `${value}${" ".repeat(Math.max(0, width - visibleLength(value)))}`
}

function visibleLength(value: string): number {
  return stripAnsi(value).length
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
}
