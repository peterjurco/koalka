import type { SeriesPoint } from "../../components/charts/chartTypes.ts";
import type { Party, PartyId } from "../../data/types.ts";
import { resolveSelection } from "../../core/coalition/electoralLists.ts";

/** Point field naming the party a sum line merely repeats at that point. */
export const sameAsKey = (sumId: string) => `${sumId}__sameAs`;

/**
 * The party whose value a sum just repeats at this point, if that party is also drawn.
 * A sum of PS + Demokrati in a poll reporting the joint list resolves to that one list;
 * with the list's own line shown, the tooltip should list the number once, not twice.
 */
export function duplicatedParty(
  partyIds: PartyId[],
  values: Record<PartyId, number>,
  parties: Party[],
  point: SeriesPoint,
): PartyId | null {
  const { subjects, blocked } = resolveSelection(partyIds, values, parties);
  if (blocked.length > 0 || subjects.length !== 1) return null;
  const [only] = subjects;
  return typeof point[only] === "number" ? only : null;
}
