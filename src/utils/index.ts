/** General utilities */

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

export function parseISODate(s: string): Date {
  return new Date(s)
}

export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Format YYYY-MM as localized month + year (e.g. "január 2024") */
export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const date = new Date(parseInt(y!, 10), parseInt(m!, 10) - 1, 1)
  return date.toLocaleDateString('sk-SK', { month: 'long', year: 'numeric' })
}
