import type { PartyId } from '../../data/types.ts'

export type SeatAllocation = Record<PartyId, number>

export interface AllocationOptions {
  /** If true, treat input as vote counts; if false, as percentages (will be normalized) */
  asPercentages?: boolean
}

/** One threshold for everybody, or a per-subject lookup (parties vs. electoral lists). */
export type Threshold = number | ((partyId: PartyId) => number)
