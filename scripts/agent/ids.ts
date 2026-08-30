export interface IdentifiablePoll {
  agency: string;
  fieldworkStart: string;
}

/**
 * Deterministic id for a NEW poll: sk-{agency}-{YYYY-MM}, with the fieldwork start day
 * appended when that month is already used. Existing ids are never reassigned — they are
 * persisted in visitors' saved coalitions.
 */
export function assignPollId(
  poll: IdentifiablePoll,
  takenIds: ReadonlySet<string>,
): string {
  const agency = poll.agency.toLowerCase();
  const month = poll.fieldworkStart.slice(0, 7);
  const day = poll.fieldworkStart.slice(8, 10);

  const base = `sk-${agency}-${month}`;
  if (!takenIds.has(base)) return base;

  const withDay = `${base}-${day}`;
  if (!takenIds.has(withDay)) return withDay;

  for (let counter = 2; counter < 20; counter++) {
    const candidate = `${withDay}-${counter}`;
    if (!takenIds.has(candidate)) return candidate;
  }

  throw new Error(`Could not assign an id for ${poll.agency} ${poll.fieldworkStart}`);
}
