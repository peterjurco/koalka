import type { PartyId } from '../../data/types.ts'

export interface CoalitionInput {
  /** Vote share per party (percentages) */
  voteShare: Record<PartyId, number>
  /** Selected party IDs for the coalition */
  partyIds: PartyId[]
  totalSeats: number
  thresholdPercent: number
  /** Majority = more than half of totalSeats */
  majorityThreshold?: number
}

export interface CoalitionResult {
  partyIds: PartyId[]
  totalVotePercent: number
  totalSeats: number
  majority: boolean
  perPartySeats: Record<PartyId, number>
  /** Seats needed for majority (e.g. 76 of 150) */
  majorityThreshold: number
}
