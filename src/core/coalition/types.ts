import type { Party, PartyId } from '../../data/types.ts'
import type { Threshold } from '../allocation/types.ts'
import type { BlockedList } from './electoralLists.ts'

export interface CoalitionInput {
  /** Vote share per party (percentages) */
  voteShare: Record<PartyId, number>
  /** Selected party IDs for the coalition (as saved by the user) */
  partyIds: PartyId[]
  totalSeats: number
  /** A single threshold, or a per-subject lookup (see makeThresholdFn) */
  thresholdPercent: Threshold
  /**
   * Party definitions. When given, selected parties that run on a joint electoral list in
   * this poll are resolved to that list (see resolveSelection).
   */
  parties?: Party[]
  /** Majority = more than half of totalSeats */
  majorityThreshold?: number
}

export interface CoalitionResult {
  /** Subjects actually counted in this poll (parties and/or electoral lists) */
  partyIds: PartyId[]
  totalVotePercent: number
  totalSeats: number
  majority: boolean
  perPartySeats: Record<PartyId, number>
  /** Seats needed for majority (e.g. 76 of 150) */
  majorityThreshold: number
  /** Electoral lists left out because only some of their members were selected */
  blocked: BlockedList[]
}
