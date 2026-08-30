import { z } from 'zod';
import type { ModelClient } from './claude.ts';
import { AGENT_CONFIG, type AgentAgency } from './config.ts';
import type { Extraction } from './types.ts';

export const ExtractionSchema = z.object({
  fieldworkStart: z.string(),
  fieldworkEnd: z.string(),
  sampleSize: z.number(),
  results: z.array(
    z.object({
      party: z.string(),
      percent: z.number(),
    }),
  ),
  notes: z.string(),
});

const SYSTEM = `You transcribe a Slovak parliamentary voting-preference poll from the
polling agency's own release.

Rules:
- Copy every number exactly as printed. Never round, never re-compute, never infer a value
  that is not printed in the document. If a percentage is printed as "20,8 %", the value is
  20.8 — not 21, not 20, not a value you back into from other rows summing to 100.
- Copy each party label verbatim, exactly as printed — same wording, case and diacritics.
  Do not translate, expand, abbreviate or normalise it. Someone else maps labels to ids.
- The document may contain a trend table with several months of results. Use only the
  column for the poll this release is announcing — the most recent one.
- fieldworkStart and fieldworkEnd are the days respondents were surveyed, as YYYY-MM-DD.
  They are not the publication date.
- sampleSize is the number of respondents.
- Put anything ambiguous in notes: a value you could not read, two candidate tables, a
  missing date, a party label split across lines. Use an empty string when nothing was
  ambiguous. Never resolve an ambiguity by guessing or by picking the more plausible-looking
  reading. fieldworkStart, fieldworkEnd and sampleSize are required fields with no way to
  leave them blank — if you cannot determine one of them with confidence, describing the
  ambiguity in notes is itself the correct response; do not also pick between candidate
  readings to fill the field. Omitting a value entirely is for results only: it is fine, and
  preferred over guessing, to leave out a party's row when that party's number cannot be
  determined — the array may end up shorter than the number of parties actually printed.`;

export interface ExtractParams {
  docText: string;
  url: string;
  agency: AgentAgency;
  client: ModelClient;
  model: string;
}

export type ExtractResult = { extraction: Extraction } | { error: string };

/**
 * Read one document into a structured poll. Party labels stay verbatim: slug mapping is
 * deterministic and happens downstream, so a party rename is a data change rather than a
 * model decision.
 */
export async function extractPoll({
  docText,
  url,
  agency,
  client,
  model,
}: ExtractParams): Promise<ExtractResult> {
  if (docText.trim() === '') {
    return { error: 'document contained no text (scanned PDF or fetch returned nothing)' };
  }
  if (docText.length > AGENT_CONFIG.maxDocChars) {
    return {
      error: `document too long (${docText.length} chars, limit ${AGENT_CONFIG.maxDocChars}) — not truncating`,
    };
  }

  const parsed = await client.parseJson({
    model,
    system: SYSTEM,
    user: `Agency: ${agency}\nSource URL: ${url}\n\n--- DOCUMENT START ---\n${docText}\n--- DOCUMENT END ---`,
    schema: ExtractionSchema,
    maxTokens: 16000,
    effort: 'high',
  });

  if (parsed == null) return { error: 'model returned no structured output' };

  const shape = ExtractionSchema.safeParse(parsed);
  if (!shape.success) {
    return { error: `extraction has an invalid shape: ${shape.error.message}` };
  }
  const extraction = shape.data;

  if (extraction.results.length < 3) {
    return { error: `extraction needs at least 3 parties (got ${extraction.results.length})` };
  }
  if (!Number.isFinite(extraction.sampleSize) || extraction.sampleSize <= 0) {
    return { error: `extraction has invalid sampleSize: ${extraction.sampleSize}` };
  }

  return { extraction };
}
