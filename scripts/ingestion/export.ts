import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { NormalizedPoll, SkipReason } from './types.ts';

/**
 * Assign deterministic IDs: sk-{agencyLower}-{YYYY-MM} or sk-{agencyLower}-{YYYY-MM}-{DD} if multiple per month.
 */
export function assignIds(polls: NormalizedPoll[]): NormalizedPoll[] {
  const byAgencyMonth = new Map<string, NormalizedPoll[]>();
  for (const p of polls) {
    const agencyLower = p.agency.toLowerCase();
    const month = p.fieldworkStart.slice(0, 7);
    const key = `${agencyLower}-${month}`;
    const list = byAgencyMonth.get(key) ?? [];
    list.push(p);
    byAgencyMonth.set(key, list);
  }

  const out: NormalizedPoll[] = [];
  for (const list of byAgencyMonth.values()) {
    list.sort((a, b) => a.fieldworkStart.localeCompare(b.fieldworkStart));
    for (let i = 0; i < list.length; i++) {
      const p = list[i]!;
      const agencyLower = p.agency.toLowerCase();
      const month = p.fieldworkStart.slice(0, 7);
      const day = p.fieldworkStart.slice(8, 10);
      const id = list.length > 1
        ? `sk-${agencyLower}-${month}-${day}`
        : `sk-${agencyLower}-${month}`;
      out.push({ ...p, id });
    }
  }

  return out.sort((a, b) => a.fieldworkStart.localeCompare(b.fieldworkStart));
}

export interface ExportOptions {
  outputPath: string;
  skipLogPath?: string;
  pretty?: boolean;
  /**
   * If set (YYYY-MM-DD), polls in existing file with fieldworkEnd <= this date are kept
   * and not overwritten by this run's output.
   */
  processedDataUntil?: string;
}

/**
 * Load existing polls from path; return [] if file missing or invalid.
 */
async function loadExistingPolls(outputPath: string): Promise<NormalizedPoll[]> {
  try {
    const raw = await readFile(outputPath, 'utf-8');
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data as NormalizedPoll[];
  } catch {
    return [];
  }
}

/**
 * Assign IDs, merge with existing verified data if processedDataUntil is set, sort, write JSON and optional skip log.
 * Returns the number of polls written to the output file.
 */
export async function exportPolls(
  polls: NormalizedPoll[],
  skips: SkipReason[],
  options: ExportOptions
): Promise<number> {
  const runPollsWithIds = assignIds(polls);
  const runIds = new Set(runPollsWithIds.map((p) => p.id));

  let finalPolls: NormalizedPoll[];
  const existingById = new Map<string, NormalizedPoll>();

  if (options.processedDataUntil != null && options.processedDataUntil !== '') {
    const existing = await loadExistingPolls(options.outputPath);
    for (const p of existing) {
      existingById.set(p.id, p);
    }
    const until = options.processedDataUntil;
    // Verified polls are kept as-is regardless of whether this run re-fetched them.
    const verified = existing.filter((p) => p.fieldworkEnd <= until);
    const verifiedIds = new Set(verified.map((p) => p.id));
    const existingNotVerified = existing.filter((p) => p.fieldworkEnd > until);
    const existingToKeep = existingNotVerified.filter((p) => !runIds.has(p.id));
    // Only merge/update polls that are not already verified.
    const runMerged = runPollsWithIds
      .filter((p) => !verifiedIds.has(p.id))
      .map((p) => {
        const ex = existingById.get(p.id);
        if (!ex) return p;
        return {
          ...p,
          results: ex.results ? { ...ex.results, ...p.results } : p.results,
          ...(ex.metadata != null && p.metadata == null ? { metadata: ex.metadata } : {}),
          ...(ex.methodology != null && p.methodology == null ? { methodology: ex.methodology } : {}),
        };
      });
    finalPolls = [...verified, ...existingToKeep, ...runMerged];
  } else {
    finalPolls = runPollsWithIds;
  }

  // Deduplicate by id (last wins) so multiple runs never leave duplicate records
  const byId = new Map<string, NormalizedPoll>();
  for (const p of finalPolls) {
    byId.set(p.id, p);
  }
  finalPolls = Array.from(byId.values()).sort((a, b) =>
    a.fieldworkStart.localeCompare(b.fieldworkStart)
  );

  const payload = options.pretty !== false
    ? JSON.stringify(finalPolls, null, 2)
    : JSON.stringify(finalPolls);

  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, payload, 'utf-8');

  if (options.skipLogPath && skips.length > 0) {
    await mkdir(dirname(options.skipLogPath), { recursive: true });
    const skipPayload = options.pretty !== false
      ? JSON.stringify(skips, null, 2)
      : JSON.stringify(skips);
    await writeFile(options.skipLogPath, skipPayload, 'utf-8');
  }

  return finalPolls.length;
}
