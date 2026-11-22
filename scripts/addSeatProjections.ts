/**
 * Add metadata.seatProjection (mandates per party) to every poll in polls.json
 * using the Hagenbach-Bischoff quota (zákon č. 180/2014 Z. z., §68).
 * Run from repo root: npx tsx scripts/addSeatProjections.ts
 *
 * Reads public/data/sk/election.json for totalSeats and thresholds, parties.json for
 * electoral lists (7 % / 10 % threshold), and polls.json. Writes back to polls.json.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { allocateSeats } from "../src/core/allocation/index.ts";
import { makeThresholdFn } from "../src/core/coalition/electoralLists.ts";
import type { ElectionRules, Party, Poll } from "../src/data/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SK_DATA = join(REPO_ROOT, "public/data/sk");
const POLLS_PATH = join(SK_DATA, "polls.json");
const ELECTION_PATH = join(SK_DATA, "election.json");
const PARTIES_PATH = join(SK_DATA, "parties.json");

function main(): void {
  const electionJson = readFileSync(ELECTION_PATH, "utf-8");
  const rules = JSON.parse(electionJson) as ElectionRules;
  const parties = JSON.parse(readFileSync(PARTIES_PATH, "utf-8")) as Party[];
  const { totalSeats } = rules;
  const threshold = makeThresholdFn(parties, rules);

  const pollsJson = readFileSync(POLLS_PATH, "utf-8");
  const polls = JSON.parse(pollsJson) as Poll[];

  let updated = 0;
  for (const poll of polls) {
    const seatProjection = allocateSeats(
      poll.results,
      totalSeats,
      threshold,
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
