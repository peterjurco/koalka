import type { PartyId } from "../../data/types.ts";

export interface PartySum {
  id: string;
  name: string;
  partyIds: PartyId[];
  /** Line color in the chart (persisted); assigned when sum is created */
  color?: string;
}

/** Palette for sum lines; used when creating new sums and as fallback for legacy data */
export const SUM_PALETTE = [
  "#8b5cf6", // violet
  "#ea580c", // orange
  "#059669", // emerald
  "#2563eb", // blue
  "#dc2626", // red
  "#ca8a04", // yellow
  "#db2777", // pink
  "#0891b2", // cyan
  "#65a30d", // lime
  "#7c3aed", // purple
] as const;

export function getSumColor(sumIndex: number): string {
  return SUM_PALETTE[sumIndex % SUM_PALETTE.length];
}

export interface TrendyStorage {
  visiblePartyIds: string[];
  customSums: PartySum[];
  visibleSumIds: string[];
}

const STORAGE_PREFIX = "koalka-trendy-";

export function getTrendyStorageKey(electionId: string): string {
  return `${STORAGE_PREFIX}${electionId}`;
}

export function loadTrendyStorage(electionId: string): TrendyStorage | null {
  try {
    const raw = localStorage.getItem(getTrendyStorageKey(electionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrendyStorage;
    if (
      !Array.isArray(parsed.visiblePartyIds) ||
      !Array.isArray(parsed.customSums) ||
      !Array.isArray(parsed.visibleSumIds)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveTrendyStorage(electionId: string, data: TrendyStorage): void {
  try {
    localStorage.setItem(getTrendyStorageKey(electionId), JSON.stringify(data));
  } catch {
    // ignore
  }
}
