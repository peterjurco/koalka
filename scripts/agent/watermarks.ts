/** Minimal shape needed to compute a watermark. */
export interface PollLike {
  agency: string;
  fieldworkEnd: string;
}

/**
 * Latest fieldworkEnd per watched agency, or null when the agency has no polls yet.
 * Dates are ISO (YYYY-MM-DD), so lexicographic comparison is chronological.
 */
export function computeWatermarks(
  polls: readonly PollLike[],
  agencies: readonly string[],
): Record<string, string | null> {
  const watermarks: Record<string, string | null> = {};
  for (const agency of agencies) watermarks[agency] = null;

  for (const poll of polls) {
    if (!(poll.agency in watermarks)) continue;
    const current = watermarks[poll.agency];
    if (current == null || poll.fieldworkEnd > current) {
      watermarks[poll.agency] = poll.fieldworkEnd;
    }
  }

  return watermarks;
}
