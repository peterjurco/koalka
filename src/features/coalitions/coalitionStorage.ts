import type { PartyId } from '../../data/types.ts';

export interface SavedCoalition {
  id: string;
  partyIds: PartyId[];
}

export interface CoalitionStorageData {
  pollId: string;
  /** ID of the newest poll at the time of the last save — used to detect new polls on next visit */
  latestPollIdAtSave: string;
  coalitions: SavedCoalition[];
}

export const DEFAULT_COALITIONS: SavedCoalition[] = [
  { id: 'default-1', partyIds: ['ps', 'sas', 'kdh', 'demokrati'] },
  { id: 'default-2', partyIds: ['ps', 'sas', 'kdh', 'demokrati', 'olano'] },
  { id: 'default-3', partyIds: ['smer', 'hlas', 'sns'] },
  { id: 'default-4', partyIds: ['smer', 'hlas', 'sns', 'republika'] },
];

const STORAGE_PREFIX = 'koalka-koalicie-';

export function getCoalitionStorageKey(electionId: string): string {
  return `${STORAGE_PREFIX}${electionId}`;
}

export function loadCoalitionStorage(electionId: string): CoalitionStorageData | null {
  try {
    const raw = localStorage.getItem(getCoalitionStorageKey(electionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoalitionStorageData;
    if (
      typeof parsed.pollId !== 'string' ||
      typeof parsed.latestPollIdAtSave !== 'string' ||
      !Array.isArray(parsed.coalitions)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveCoalitionStorage(electionId: string, data: CoalitionStorageData): void {
  try {
    localStorage.setItem(getCoalitionStorageKey(electionId), JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

/**
 * Decide which poll to show: if a newer poll arrived since last visit, use that.
 * Otherwise restore the previously selected poll.
 */
export function resolveInitialPollId(
  stored: CoalitionStorageData | null,
  newestPollId: string,
): string {
  if (!stored) return newestPollId;
  if (stored.latestPollIdAtSave !== newestPollId) return newestPollId;
  return stored.pollId;
}
