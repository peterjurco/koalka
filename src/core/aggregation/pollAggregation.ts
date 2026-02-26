import type { Poll, VoteShare } from '../../data/types.ts'
import { parseISODate, getMonthKey } from '../../utils/index.ts'

export interface MonthlyAggregate {
  month: string
  /** YYYY-MM */
  monthKey: string
  pollCount: number
  results: VoteShare
}

/**
 * Aggregate poll results by month: average percentage per party per month.
 * Uses fieldwork end date to assign poll to a month.
 */
export function aggregatePollsByMonth(polls: Poll[]): MonthlyAggregate[] {
  const byMonth = new Map<string, { sum: VoteShare; count: number }>()

  for (const poll of polls) {
    const date = parseISODate(poll.fieldworkEnd)
    const key = getMonthKey(date)
    const existing = byMonth.get(key)
    const results = poll.results

    if (!existing) {
      byMonth.set(key, { sum: { ...results }, count: 1 })
    } else {
      for (const [partyId, pct] of Object.entries(results)) {
        existing.sum[partyId] = (existing.sum[partyId] ?? 0) + pct
      }
      existing.count += 1
    }
  }

  const months = Array.from(byMonth.entries())
    .map(([monthKey, { sum, count }]) => {
      const results: VoteShare = {}
      for (const [id, s] of Object.entries(sum)) {
        results[id] = s / count
      }
      const [y, m] = monthKey.split('-')
      const month = `${y}-${m}` // same as monthKey
      return { month, monthKey, pollCount: count, results }
    })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

  return months
}
