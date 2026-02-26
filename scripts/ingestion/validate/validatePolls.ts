import type { NormalizedPoll, SkipReason } from '../types.ts';
import type { ValidationOptions } from './schema.ts';
import { validatePoll, dedupKey } from './schema.ts';

export interface ValidateResult {
  polls: NormalizedPoll[];
  skips: SkipReason[];
}

/**
 * Validate all polls: schema checks, time filter, deduplication by (agency, fieldworkStart, fieldworkEnd).
 * Keeps first occurrence of each key; later duplicates are skipped.
 */
export function validatePolls(
  polls: NormalizedPoll[],
  options: ValidationOptions
): ValidateResult {
  const skips: SkipReason[] = [];
  const seen = new Set<string>();
  const valid: NormalizedPoll[] = [];

  for (const poll of polls) {
    const schemaError = validatePoll(poll, options);
    if (schemaError) {
      skips.push(schemaError);
      continue;
    }
    const key = dedupKey(poll);
    if (seen.has(key)) {
      skips.push({
        url: poll.sourceUrl,
        agency: poll.agency,
        reason: `Duplicate (agency + fieldworkStart + fieldworkEnd): ${key}`,
      });
      continue;
    }
    seen.add(key);
    valid.push(poll);
  }

  return { polls: valid, skips };
}
