import type { Poll, VoteShare } from '../../data/types.ts'
import { parseISODate, getMonthKey } from '../../utils/index.ts'

export interface MonthlyAggregate {
  month: string
  /** YYYY-MM */
  monthKey: string
  pollCount: number
  results: VoteShare
}

export type TrendValueSource = 'results' | 'seatProjection'

/**
 * Aggregate poll results by month: average per party per month.
 * Uses fieldwork end date to assign poll to a month.
 * valueSource: 'results' = percentages, 'seatProjection' = mandates (from metadata.seatProjection).
 */
export function aggregatePollsByMonth(
  polls: Poll[],
  valueSource: TrendValueSource = 'results'
): MonthlyAggregate[] {
  const byMonth = new Map<string, { sum: VoteShare; count: number }>()

  for (const poll of polls) {
    const date = parseISODate(poll.fieldworkEnd)
    const key = getMonthKey(date)
    const existing = byMonth.get(key)
    const values: VoteShare =
      valueSource === 'seatProjection'
        ? (poll.metadata?.seatProjection ?? {})
        : poll.results

    if (!existing) {
      byMonth.set(key, { sum: { ...values }, count: 1 })
    } else {
      for (const [partyId, v] of Object.entries(values)) {
        existing.sum[partyId] = (existing.sum[partyId] ?? 0) + v
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
