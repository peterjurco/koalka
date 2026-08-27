import type { NormalizedPoll } from '../ingestion/types.ts';
import type { AgentAgency } from './config.ts';

/** A page that might contain a poll newer than the agency's watermark. */
export interface Lead {
  agency: AgentAgency;
  url: string;
  /** Where the lead came from — used in the report so a false lead is traceable. */
  discoveredBy: 'site' | 'aggregator';
  /** Link text or aggregator row summary, for the report. */
  label: string;
}

/** One party row as the model read it, party label left verbatim. */
export interface ExtractedResult {
  party: string;
  percent: number;
}

/** What the model returns for a single document. */
export interface Extraction {
  fieldworkStart: string;
  fieldworkEnd: string;
  sampleSize: number;
  results: ExtractedResult[];
  notes: string;
}

/** Whether an extracted (party, value) pair is actually present in the source text. */
export interface GroundingResult {
  party: string;
  value: number;
  grounded: boolean;
  reason: string;
}

/** A row of the aggregator table. `results` keys are canonical slugs. */
export interface AggregatorRow {
  agency: string;
  fieldworkStart: string;
  fieldworkEnd: string;
  sampleSize: number | null;
  results: Record<string, number>;
}

/** A disagreement between the extraction and the aggregator. */
export interface Mismatch {
  field: string;
  extracted: string | number | null;
  aggregator: string | number | null;
}

/** Everything that happened to one lead. This is the handoff artifact. */
export interface LeadReport {
  agency: AgentAgency;
  url: string;
  discoveredBy: 'site' | 'aggregator';
  label: string;
  outcome: 'added' | 'skipped' | 'failed';
  /** Why it was skipped or failed. Empty when added. */
  reason: string;
  extraction: Extraction | null;
  /** Party labels the slug mapper did not recognise, with their values. */
  unmapped: ExtractedResult[];
  grounding: GroundingResult[];
  mismatches: Mismatch[];
  pollId: string | null;
}

/** The whole run. Written to scripts/agent/logs/agent-run-YYYY-MM-DD.json. */
export interface AgentRunReport {
  runDate: string;
  watermarks: Record<string, string | null>;
  leadCount: number;
  leads: LeadReport[];
  /**
   * Polls the aggregator lists for a watched agency, newer than the watermark, that no
   * agency-site lead matched. The agent does not chase these — it reports them so a human
   * can add the poll by hand.
   */
  aggregatorGaps: AggregatorRow[];
  addedPolls: NormalizedPoll[];
}
