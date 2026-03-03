/**
 * Add metadata.seatProjection (mandates per party) to every poll in polls.json
 * using the Hagenbach-Bischoff quota (zákon č. 180/2014 Z. z., §68).
 * Run from repo root: npx tsx scripts/addSeatProjections.ts
 *
 * Reads public/data/sk/election.json for totalSeats and thresholdPercent,
 * and public/data/sk/polls.json. Writes back to polls.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allocateSeats } from "../src/core/allocation/index.ts";
import type { Poll } from "../src/data/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SK_DATA = join(REPO_ROOT, "public/data/sk");
const POLLS_PATH = join(SK_DATA, "polls.json");
const ELECTION_PATH = join(SK_DATA, "election.json");

interface ElectionRules {
  totalSeats: number;
  thresholdPercent: number;
}

function main(): void {
  const electionJson = readFileSync(ELECTION_PATH, "utf-8");
  const rules = JSON.parse(electionJson) as ElectionRules;
  const { totalSeats, thresholdPercent } = rules;

  const pollsJson = readFileSync(POLLS_PATH, "utf-8");
  const polls = JSON.parse(pollsJson) as Poll[];

  let updated = 0;
  for (const poll of polls) {
    const seatProjection = allocateSeats(
      poll.results,
      totalSeats,
      thresholdPercent,
      { asPercentages: true }
    );
    (poll as Poll & { metadata?: { seatProjection?: Record<string, number> } }).metadata = {
      ...(poll.metadata ?? {}),
      seatProjection,
    };
    updated += 1;
  }

  writeFileSync(POLLS_PATH, JSON.stringify(polls, null, 2), "utf-8");
  console.log(`Added seatProjection to ${updated} polls in ${POLLS_PATH}`);
}

main();
