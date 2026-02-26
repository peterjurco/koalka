import type { PartyId } from '../../../src/data/types.ts';
import type { RawPoll, NormalizedPoll, PollAgency, PollMethodology, PollMetadata, SkipReason } from '../types.ts';
import { mapResultsToSlugs, resolvePartySlug } from './partySlugs.ts';
import { parseDateToYYYYMMDD, isYYYYMMDD } from './dates.ts';

const PERCENT_MIN = 0;
const PERCENT_MAX = 100;

function toFloat(x: unknown): number | null {
  if (typeof x === 'number' && !Number.isNaN(x)) return x;
  if (typeof x === 'string') {
    const n = parseFloat(x.replace(/,/g, '.').trim());
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Normalize a raw poll: dates to YYYY-MM-DD, party names to canonical slugs,
 * numbers to floats. Returns normalized poll or skip reason.
 */
export function normalizePoll(
  raw: RawPoll,
  countryId: string,
  electionId: string
): { poll: NormalizedPoll } | { skip: SkipReason } {
  const start = isYYYYMMDD(raw.fieldworkStart)
    ? raw.fieldworkStart.trim()
    : parseDateToYYYYMMDD(raw.fieldworkStart);
  const end = isYYYYMMDD(raw.fieldworkEnd)
    ? raw.fieldworkEnd.trim()
    : parseDateToYYYYMMDD(raw.fieldworkEnd);

  if (!start) {
    return { skip: { url: raw.sourceUrl, agency: raw.agency, reason: 'Unparseable fieldworkStart', context: raw.fieldworkStart } };
  }
  if (!end) {
    return { skip: { url: raw.sourceUrl, agency: raw.agency, reason: 'Unparseable fieldworkEnd', context: raw.fieldworkEnd } };
  }

  const { results: slugResults, unmapped } = mapResultsToSlugs(raw.results);
  if (Object.keys(slugResults).length < 3) {
    return {
      skip: {
        url: raw.sourceUrl,
        agency: raw.agency,
        reason: `Fewer than 3 parties after slug mapping (unmapped: ${unmapped.join(', ')})`,
        context: { unmapped, rawKeys: Object.keys(raw.results) },
      },
    };
  }

  const results: Record<PartyId, number> = {};
  for (const [slug, v] of Object.entries(slugResults)) {
    const n = toFloat(v);
    if (n == null || n < PERCENT_MIN || n > PERCENT_MAX) {
      return {
        skip: {
          url: raw.sourceUrl,
          agency: raw.agency,
          reason: `Invalid percentage for ${slug}: ${v}`,
        },
      };
    }
    results[slug as PartyId] = n;
  }

  let metadata: PollMetadata | undefined;
  if (raw.metadata) {
    metadata = {};
    if (raw.metadata.turnout != null) {
      const t = toFloat(raw.metadata.turnout);
      if (t != null && t >= 0 && t <= 100) metadata.turnout = t;
    }
    if (raw.metadata.seatProjection && typeof raw.metadata.seatProjection === 'object') {
      const sp: Record<PartyId, number> = {};
      for (const [k, v] of Object.entries(raw.metadata.seatProjection)) {
        const canonicalSlug = resolvePartySlug(k);
        if (canonicalSlug) {
          const n = toFloat(v);
          if (n != null && n >= 0) sp[canonicalSlug] = n;
        }
      }
      if (Object.keys(sp).length > 0) metadata.seatProjection = sp;
    }
  }

  const methodology: PollMethodology | undefined = raw.methodology
    ? { ...raw.methodology }
    : undefined;

  const poll: NormalizedPoll = {
    id: '', // assigned in export
    countryId,
    electionId,
    agency: raw.agency as PollAgency,
    fieldworkStart: start,
    fieldworkEnd: end,
    sampleSize: raw.sampleSize,
    methodology,
    sourceUrl: raw.sourceUrl,
    results,
    metadata: Object.keys(metadata ?? {}).length > 0 ? metadata : undefined,
  };

  return { poll };
}

/**
 * Normalize many raw polls; collect skips.
 */
export function normalizePolls(
  rawPolls: RawPoll[],
  countryId: string,
  electionId: string
): { polls: NormalizedPoll[]; skips: SkipReason[] } {
  const polls: NormalizedPoll[] = [];
  const skips: SkipReason[] = [];
  for (const raw of rawPolls) {
    const out = normalizePoll(raw, countryId, electionId);
    if ('poll' in out) polls.push(out.poll);
    else skips.push(out.skip);
  }
  return { polls, skips };
}
