import { allocateSeats } from '../allocation/index.ts'
import { resolveSelection } from './electoralLists.ts'
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
    parties,
    majorityThreshold = Math.floor(totalSeats / 2) + 1,
  } = input

  const { subjects, blocked } = parties
    ? resolveSelection(partyIds, voteShare, parties)
    : { subjects: [...partyIds], blocked: [] }

  let totalVotePercent = 0
  for (const id of subjects) {
    totalVotePercent += voteShare[id] ?? 0
  }

  const perPartySeats = allocateSeats(
    voteShare,
    totalSeats,
    thresholdPercent,
    { asPercentages: true }
  )

  let totalSeatsForCoalition = 0
  for (const id of subjects) {
    totalSeatsForCoalition += perPartySeats[id] ?? 0
  }

  const majority = totalSeatsForCoalition >= majorityThreshold

  return {
    partyIds: subjects,
    totalVotePercent,
    totalSeats: totalSeatsForCoalition,
    majority,
    perPartySeats,
    majorityThreshold,
    blocked,
  }
}
