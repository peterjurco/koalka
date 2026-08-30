import { AGENT_CONFIG } from './config.ts';
import type { AggregatorRow, Mismatch } from './types.ts';

/** The extracted, slug-mapped poll as it would be written to polls.json. */
export interface CrossCheckable {
  fieldworkStart: string;
  fieldworkEnd: string;
  sampleSize: number;
  results: Record<string, number>;
}

/**
 * Below this share, a party missing from one side is normal rather than suspicious —
 * agencies routinely omit sub-1% parties that the aggregator lists, and vice versa.
 */
const MISSING_PARTY_FLOOR = 1;

/**
 * Diff an extraction against the aggregator's row for the same poll. Every difference is
 * a warning for the PR, never a block: the aggregator is secondhand and can be stale or
 * wrong itself.
 */
export function crossCheck(
  poll: CrossCheckable,
  row: AggregatorRow,
  tolerance: number = AGENT_CONFIG.crossCheckTolerance,
): Mismatch[] {
  const mismatches: Mismatch[] = [];

  if (poll.fieldworkStart !== row.fieldworkStart) {
    mismatches.push({
      field: 'fieldworkStart',
      extracted: poll.fieldworkStart,
      aggregator: row.fieldworkStart,
    });
  }
  if (poll.fieldworkEnd !== row.fieldworkEnd) {
    mismatches.push({
      field: 'fieldworkEnd',
      extracted: poll.fieldworkEnd,
      aggregator: row.fieldworkEnd,
    });
  }
  if (row.sampleSize != null && poll.sampleSize !== row.sampleSize) {
    mismatches.push({
      field: 'sampleSize',
      extracted: poll.sampleSize,
      aggregator: row.sampleSize,
    });
  }

  for (const [slug, aggregatorValue] of Object.entries(row.results)) {
    const extractedValue = poll.results[slug];
    if (extractedValue == null) {
      if (aggregatorValue >= MISSING_PARTY_FLOOR) {
        mismatches.push({
          field: `results.${slug}`,
          extracted: null,
          aggregator: aggregatorValue,
        });
      }
      continue;
    }
    if (Math.abs(extractedValue - aggregatorValue) > tolerance) {
      mismatches.push({
        field: `results.${slug}`,
        extracted: extractedValue,
        aggregator: aggregatorValue,
      });
    }
  }

  return mismatches;
}
