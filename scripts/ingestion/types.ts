import type { PartyId, VoteShare } from '../../src/data/types.ts';

/** Poll agency (Slovak parliamentary polls) */
export type PollAgency = 'Focus' | 'AKO' | 'Ipsos' | 'NMS';

/** Methodology details from agency releases */
export interface PollMethodology {
  mode?: string;
  panel?: string;
  weighting?: string;
  notes?: string;
  client?: string;
}

/** Optional poll metadata */
export interface PollMetadata {
  turnout?: number;
  seatProjection?: Record<PartyId, number>;
}

/** Normalized poll (pipeline output shape) */
export interface NormalizedPoll {
  id: string;
  countryId: string;
  electionId: string;
  agency: PollAgency;
  fieldworkStart: string;
  fieldworkEnd: string;
  sampleSize: number;
  methodology?: PollMethodology;
  sourceUrl: string;
  results: VoteShare;
  metadata?: PollMetadata;
}

/** Raw poll as produced by parsers (before normalization) */
export interface RawPoll {
  agency: PollAgency;
  fieldworkStart: string;
  fieldworkEnd: string;
  sampleSize: number;
  methodology?: PollMethodology;
  sourceUrl: string;
  /** Party name or raw label → percentage (before slug normalization) */
  results: Record<string, number>;
  metadata?: PollMetadata;
}

/** Reason a poll was skipped */
export interface SkipReason {
  url?: string;
  agency?: string;
  reason: string;
  /** Optional raw poll or identifier for debugging */
  context?: unknown;
}

/** Fetcher output: raw content for parser */
export interface FetchedDocument {
  url: string;
  html?: string;
  pdfBuffer?: ArrayBuffer;
  pdfText?: string;
}

/** Optional date window for fetchers: only fetch sources that fall in [dateFrom, dateTo] (YYYY-MM-DD). */
export interface FetchOptions {
  dateFrom?: string | null;
  dateTo?: string | null;
}
