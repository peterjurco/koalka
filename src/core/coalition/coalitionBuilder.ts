import { allocateSeats } from '../allocation/index.ts'
import type { CoalitionInput, CoalitionResult } from './types.ts'

/**
 * Build coalition result: sum vote % and seats for selected parties,
 * and check if coalition has majority.
 */
export function buildCoalition(input: CoalitionInput): CoalitionResult {
  const {
    voteShare,
    partyIds,
    totalSeats,
    thresholdPercent,
    majorityThreshold = Math.floor(totalSeats / 2) + 1,
  } = input

  const set = new Set(partyIds)
  let totalVotePercent = 0
  for (const id of partyIds) {
    totalVotePercent += voteShare[id] ?? 0
  }

  const perPartySeats = allocateSeats(
    voteShare,
    totalSeats,
    thresholdPercent,
    { asPercentages: true }
  )

  let totalSeatsForCoalition = 0
  for (const id of set) {
    totalSeatsForCoalition += perPartySeats[id] ?? 0
  }

  const majority = totalSeatsForCoalition >= majorityThreshold

  return {
    partyIds: [...partyIds],
    totalVotePercent,
    totalSeats: totalSeatsForCoalition,
    majority,
    perPartySeats,
    majorityThreshold,
  }
}
