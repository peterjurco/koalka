/** Party identifier (matches keys in poll results and party list) */
export type PartyId = string;

/** Single party definition for an election */
export interface Party {
  id: PartyId;
  name: string;
  shortName: string;
  color: string;
  order: number;
  /** Whether the party is shown in the trend chart by default (default true if omitted) */
  visibleByDefault?: boolean;
}

/** Vote/share per party (percentages or counts) */
export type VoteShare = Record<PartyId, number>;

/** Poll agency (Slovak parliamentary polls) */
export type PollAgency = 'Focus' | 'AKO' | 'Ipsos' | 'NMS';

/** Methodology details (optional fields from agency releases) */
export interface PollMethodology {
  mode?: string;
  panel?: string;
  weighting?: string;
  notes?: string;
  client?: string;
}

/** Optional poll metadata (turnout, seat projection) */
export interface PollMetadata {
  turnout?: number;
  seatProjection?: Record<PartyId, number>;
}

/** One poll result: percentages by party */
export interface Poll {
  id: string;
  countryId: string;
  electionId: string;
  agency: PollAgency | string;
  fieldworkStart: string;
  fieldworkEnd: string;
  sourceUrl?: string;
  results: VoteShare;
  sampleSize?: number;
  /** Legacy: string; pipeline output: object */
  methodology?: PollMethodology | string;
  metadata?: PollMetadata;
}

/** Election rules and metadata */
export interface ElectionRules {
  electionId: string;
  countryId: string;
  name: string;
  type: 'parliamentary' | 'european' | string;
  totalSeats: number;
  thresholdPercent: number;
  allocationMethod: 'dHondt' | string;
  constituencies?: unknown;
}

/** Seat allocation result: partyId -> seats */
export type SeatAllocation = Record<PartyId, number>;

/** Coalition result from builder */
export interface CoalitionResult {
  partyIds: PartyId[];
  totalVotePercent: number;
  totalSeats: number;
  majority: boolean;
  perPartySeats: SeatAllocation;
}

/** Loaded election config: rules + parties */
export interface ElectionConfig {
  rules: ElectionRules;
  parties: Party[];
}

/** Data loader returns polls; config comes from election registry */
export type PollsLoader = (countryId: string, electionId: string) => Promise<Poll[]>;
