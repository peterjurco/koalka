import type { PartyId } from '../../data/types.ts'
import type { AllocationOptions, SeatAllocation } from './types.ts'

/**
 * Allocate seats using d'Hondt method with a vote threshold.
 * Input: vote shares (percentages or counts), total seats, threshold.
 * Output: map partyId -> seats.
 */
export function allocateSeats(
  votes: Record<PartyId, number>,
  totalSeats: number,
  thresholdPercent: number,
  options?: AllocationOptions
): Record<PartyId, number> {
  const asPercentages = options?.asPercentages ?? true
  const entries = Object.entries(votes) as [PartyId, number][]

  // 1. Apply threshold
  const aboveThreshold = entries.filter(([, v]) => v >= thresholdPercent)
  if (aboveThreshold.length === 0) {
    return Object.fromEntries(entries.map(([id]) => [id, 0])) as SeatAllocation
  }

  // 2. Normalize: treat as vote counts (if percentages, sum and use as relative weights)
  const totalValid = aboveThreshold.reduce((s, [, v]) => s + v, 0)
  const counts = new Map<PartyId, number>(
    aboveThreshold.map(([id, v]) => [id, asPercentages ? (v / totalValid) * 100 : v])
  )

  // 3. d'Hondt: divisors 1, 2, 3, ...; assign seat to party with highest quotient each round
  const seats = new Map<PartyId, number>(aboveThreshold.map(([id]) => [id, 0]))
  const divisors = new Map<PartyId, number>(aboveThreshold.map(([id]) => [id, 1]))

  for (let assigned = 0; assigned < totalSeats; assigned++) {
    let bestParty: PartyId | null = null
    let bestQuotient = -1
    for (const [id] of aboveThreshold) {
      const count = counts.get(id) ?? 0
      const div = divisors.get(id) ?? 1
      const q = count / div
      if (q > bestQuotient) {
        bestQuotient = q
        bestParty = id
      }
    }
    if (!bestParty) break
    seats.set(bestParty, (seats.get(bestParty) ?? 0) + 1)
    divisors.set(bestParty, (divisors.get(bestParty) ?? 1) + 1)
  }

  const result: Record<string, number> = {}
  for (const [id] of entries) {
    result[id] = seats.get(id as PartyId) ?? 0
  }
  return result as SeatAllocation
}
