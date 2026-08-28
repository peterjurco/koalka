import type { NormalizedPoll, PollAgency, SkipReason } from '../types.ts';

const AGENCIES: PollAgency[] = ['Focus', 'AKO', 'Ipsos'];
const YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export interface ValidationOptions {
  fieldworkStartMin: string;
  fieldworkEndMax: string;
}

/**
 * Validate a single normalized poll. Returns null if valid, or SkipReason if invalid.
 */
export function validatePoll(
  poll: NormalizedPoll,
  options: ValidationOptions
): SkipReason | null {
  if (!poll.countryId?.trim()) {
    return { url: poll.sourceUrl, agency: poll.agency, reason: 'Missing countryId' };
  }
  if (!poll.electionId?.trim()) {
    return { url: poll.sourceUrl, agency: poll.agency, reason: 'Missing electionId' };
  }
  if (!AGENCIES.includes(poll.agency as PollAgency)) {
    return { url: poll.sourceUrl, agency: poll.agency, reason: `Invalid agency: ${poll.agency}` };
  }
  if (typeof poll.sampleSize !== 'number' || poll.sampleSize <= 0) {
    return { url: poll.sourceUrl, agency: poll.agency, reason: 'sampleSize required and must be > 0' };
  }
  if (!YYYY_MM_DD.test(poll.fieldworkStart)) {
    return { url: poll.sourceUrl, agency: poll.agency, reason: 'fieldworkStart must be YYYY-MM-DD' };
  }
  if (!YYYY_MM_DD.test(poll.fieldworkEnd)) {
    return { url: poll.sourceUrl, agency: poll.agency, reason: 'fieldworkEnd must be YYYY-MM-DD' };
  }
  if (!poll.sourceUrl?.trim()) {
    return { url: poll.sourceUrl, agency: poll.agency, reason: 'Missing sourceUrl' };
  }
  const partyCount = Object.keys(poll.results).length;
  if (partyCount < 3) {
    return { url: poll.sourceUrl, agency: poll.agency, reason: `results must contain at least 3 parties (got ${partyCount})` };
  }
  if (poll.fieldworkStart < options.fieldworkStartMin) {
    return { url: poll.sourceUrl, agency: poll.agency, reason: `fieldworkStart before ${options.fieldworkStartMin}` };
  }
  if (poll.fieldworkEnd > options.fieldworkEndMax) {
    return { url: poll.sourceUrl, agency: poll.agency, reason: `fieldworkEnd after ${options.fieldworkEndMax}` };
  }
  return null;
}

export function dedupKey(poll: NormalizedPoll): string {
  return `${poll.agency}|${poll.fieldworkStart}|${poll.fieldworkEnd}`;
}
