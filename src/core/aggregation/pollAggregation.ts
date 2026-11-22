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
 *
 * Each party is averaged over the polls that report it. A party missing from a poll is
 * "not measured", not 0 %: when one agency already polls PS + Demokrati as a joint list and
 * another still polls them separately, PS must not be halved by the joint-list poll.
 */
export function aggregatePollsByMonth(
  polls: Poll[],
  valueSource: TrendValueSource = 'results'
): MonthlyAggregate[] {
  const byMonth = new Map<string, { sum: VoteShare; n: VoteShare; count: number }>()

  for (const poll of polls) {
    const date = parseISODate(poll.fieldworkEnd)
    const key = getMonthKey(date)
    let bucket = byMonth.get(key)
    if (!bucket) {
      bucket = { sum: {}, n: {}, count: 0 }
      byMonth.set(key, bucket)
    }
    const values: VoteShare =
      valueSource === 'seatProjection'
        ? (poll.metadata?.seatProjection ?? {})
        : poll.results
    for (const [partyId, v] of Object.entries(values)) {
      bucket.sum[partyId] = (bucket.sum[partyId] ?? 0) + v
      bucket.n[partyId] = (bucket.n[partyId] ?? 0) + 1
    }
    bucket.count += 1
  }

  const months = Array.from(byMonth.entries())
    .map(([monthKey, { sum, n, count }]) => {
      const results: VoteShare = {}
      for (const [id, s] of Object.entries(sum)) {
        results[id] = s / n[id]
      }
      const [y, m] = monthKey.split('-')
      const month = `${y}-${m}` // same as monthKey
      return { month, monthKey, pollCount: count, results }
    })
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

  return months
}
