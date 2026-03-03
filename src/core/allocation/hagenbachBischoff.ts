import type { PartyId } from '../../data/types.ts'
import type { AllocationOptions, SeatAllocation } from './types.ts'

/**
 * Allocate seats using the Hagenbach-Bischoff quota with largest remainder,
 * as prescribed by Slovak electoral law (zákon č. 180/2014 Z. z., §68).
 *
 * Algorithm:
 *   1. Exclude parties below the threshold.
 *   2. REN (Republikanské číslo) = floor(validVotes / (totalSeats + 1))
 *   3. Each party receives floor(votes / REN) base seats.
 *   4. Remaining seats go to parties with the largest remainders (votes % REN),
 *      ties broken by higher vote share.
 *
 * Input votes can be raw percentages (default) or absolute counts.
 * With percentages the proportions are preserved, so the result is identical
 * to using absolute vote counts.
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

  const result: Record<string, number> = {}
  for (const [id] of entries) result[id] = 0

  if (aboveThreshold.length === 0 || totalSeats === 0) {
    return result as SeatAllocation
  }

  // 2. Normalize if percentages: use the sum of above-threshold votes as total
  //    (sub-threshold votes are excluded from the valid pool, as in real elections)
  const totalValid = aboveThreshold.reduce((s, [, v]) => s + v, 0)
  const counts: [PartyId, number][] = asPercentages
    ? aboveThreshold.map(([id, v]) => [id, (v / totalValid) * 10_000])
    : aboveThreshold.map(([id, v]) => [id, v])

  const countsTotal = counts.reduce((s, [, v]) => s + v, 0)

  // 3. REN = floor(totalValid / (totalSeats + 1))
  const ren = countsTotal / (totalSeats + 1)

  // 4. Base seats = floor(votes / REN); compute remainder for each party
  let allocated = 0
  const baseSeats = new Map<PartyId, number>()
  const remainders = new Map<PartyId, number>()

  for (const [id, v] of counts) {
    const exact = v / ren
    const base = Math.floor(exact)
    baseSeats.set(id, base)
    remainders.set(id, exact - base)
    allocated += base
  }

  // 5. Distribute remaining seats by largest remainder; tie-break by vote share.
  //    If remaining < 0 (over-allocation edge case with very few parties), take back
  //    |remaining| seats from the parties with the smallest remainders.
  const remaining = totalSeats - allocated
  const sortedByRemainder = [...counts].sort(([idA, vA], [idB, vB]) => {
    const remDiff = (remainders.get(idB) ?? 0) - (remainders.get(idA) ?? 0)
    return remDiff !== 0 ? remDiff : vB - vA
  })

  if (remaining >= 0) {
    for (let i = 0; i < remaining; i++) {
      const [id] = sortedByRemainder[i]
      baseSeats.set(id, (baseSeats.get(id) ?? 0) + 1)
    }
  } else {
    // Take back over-allocated seats from parties with the smallest remainders
    const overAllocated = -remaining
    for (let i = 0; i < overAllocated; i++) {
      const [id] = sortedByRemainder[sortedByRemainder.length - 1 - i]
      baseSeats.set(id, Math.max(0, (baseSeats.get(id) ?? 0) - 1))
    }
  }

  // 6. Build result (parties below threshold stay at 0)
  for (const [id, seats] of baseSeats) {
    result[id] = seats
  }

  return result as SeatAllocation
}
