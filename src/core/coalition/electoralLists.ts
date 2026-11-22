import type { ElectionRules, Party, PartyId } from '../../data/types.ts'

/**
 * Electoral lists ("volebné koalície"): several parties running on one joint candidate
 * list, e.g. PS + Demokrati. In parties.json such a list is an ordinary party entry with
 * `members`. Polls report it as a single number, so it cannot be split back into parties.
 */

/** Slovak defaults (zákon č. 180/2014 Z. z., §66 ods. 1 písm. b, c) */
export const DEFAULT_COALITION_THRESHOLD_PERCENT = 7
export const DEFAULT_LARGE_COALITION_THRESHOLD_PERCENT = 10

export function isElectoralList(party: Party | undefined): boolean {
  return (party?.members?.length ?? 0) >= 2
}

/** Threshold for one electoral subject: 5 % party, 7 % list of 2–3 parties, 10 % list of 4+. */
export function thresholdForParty(
  party: Party | undefined,
  rules: Pick<ElectionRules, 'thresholdPercent' | 'coalitionThresholdPercent' | 'largeCoalitionThresholdPercent'>,
): number {
  const members = party?.members?.length ?? 0
  if (members >= 4) return rules.largeCoalitionThresholdPercent ?? DEFAULT_LARGE_COALITION_THRESHOLD_PERCENT
  if (members >= 2) return rules.coalitionThresholdPercent ?? DEFAULT_COALITION_THRESHOLD_PERCENT
  return rules.thresholdPercent
}

/** Threshold lookup by party id, for allocateSeats. Unknown ids get the single-party threshold. */
export function makeThresholdFn(
  parties: Party[],
  rules: Pick<ElectionRules, 'thresholdPercent' | 'coalitionThresholdPercent' | 'largeCoalitionThresholdPercent'>,
): (partyId: PartyId) => number {
  const byId = new Map(parties.map((p) => [p.id, p]))
  return (id) => thresholdForParty(byId.get(id), rules)
}

export interface BlockedList {
  /** The electoral list the poll reports */
  listId: PartyId
  /** Selected members of that list */
  selected: PartyId[]
  /** Members that would have to be added for the list to count */
  missing: PartyId[]
}

export interface ResolvedSelection {
  /** Ids to read from the poll: parties and/or whole electoral lists */
  subjects: PartyId[]
  /** Lists left out because only some of their members were selected */
  blocked: BlockedList[]
}

/**
 * Translate a saved selection of parties into the subjects one poll actually reports.
 *
 * The decision is driven by what the poll contains, not by a date: while some agencies
 * still poll PS and Demokrati separately, those polls keep using the separate numbers.
 *
 * - All members of a list selected and the poll reports the list → the list replaces them.
 * - Only some members selected → the list is left out (its share cannot be split) and
 *   reported in `blocked`, so the UI can say why.
 * - A list id selected directly expands to its members first, so both spellings behave alike.
 */
export function resolveSelection(
  selected: PartyId[],
  reported: ReadonlySet<PartyId> | Record<PartyId, unknown>,
  parties: Party[],
): ResolvedSelection {
  const has = (id: PartyId) =>
    reported instanceof Set ? reported.has(id) : Object.prototype.hasOwnProperty.call(reported, id)

  const lists = parties.filter(isElectoralList)
  const listById = new Map(lists.map((l) => [l.id, l]))

  // Normalise to member parties, keeping the user's order.
  const wanted: PartyId[] = []
  for (const id of selected) {
    const ids = listById.get(id)?.members ?? [id]
    for (const m of ids) if (!wanted.includes(m)) wanted.push(m)
  }

  const subjects: PartyId[] = []
  const blocked: BlockedList[] = []
  const consumed = new Set<PartyId>()

  for (const list of lists) {
    if (!has(list.id)) continue
    const members = list.members!
    const picked = members.filter((m) => wanted.includes(m))
    if (picked.length === 0) continue
    // A member the poll still reports on its own (unusual) is not covered by the list.
    const covered = members.filter((m) => !has(m))
    if (covered.length === 0) continue
    if (picked.length === members.length) {
      subjects.push(list.id)
    } else if (picked.some((m) => covered.includes(m))) {
      blocked.push({
        listId: list.id,
        selected: picked,
        missing: members.filter((m) => !wanted.includes(m)),
      })
    }
    for (const m of covered) consumed.add(m)
  }

  // Order: lists first appear where their first member was selected.
  const ordered: PartyId[] = []
  for (const id of wanted) {
    if (consumed.has(id)) {
      const list = subjects.find((s) => listById.get(s)!.members!.includes(id))
      if (list && !ordered.includes(list)) ordered.push(list)
    } else if (!ordered.includes(id)) {
      ordered.push(id)
    }
  }

  return { subjects: ordered, blocked }
}

/** Sum of a selection's share in one poll (or monthly average), with list resolution. */
export function sumSelection(
  selected: PartyId[],
  values: Record<PartyId, number>,
  parties: Party[],
): number {
  const { subjects } = resolveSelection(selected, values, parties)
  return subjects.reduce((s, id) => s + (values[id] ?? 0), 0)
}
