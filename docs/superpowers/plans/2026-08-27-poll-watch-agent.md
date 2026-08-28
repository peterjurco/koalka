# Poll Watch Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly GitHub Action that notices a new poll from AKO, Focus or Ipsos, extracts it with Claude, verifies it against the source text, and opens a PR that tags the maintainer.

**Architecture:** A new `scripts/agent/` pipeline reusing the existing `scripts/ingestion/` normalize, validate and type modules. The model acts in exactly two places — triaging links on an agency page, and reading field values out of one fetched document. Everything else (slug mapping, date normalization, validation, dedup, merging, seat projection, PR body) is deterministic, unit-tested code. The Node script writes files only; the workflow does all git and `gh` work.

**Tech Stack:** TypeScript run through `tsx`, `@anthropic-ai/sdk` with `zod` structured outputs, `cheerio` for HTML, `pdf-parse` for PDFs, `vitest` for tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-27-poll-watch-agent-design.md`

---

## Background the implementer needs

This repo is a static React app. Poll data lives in `public/data/sk/polls.json` — a JSON **array** of poll objects, sorted ascending by `fieldworkStart`, loaded by the browser at runtime. There is no server and no database. "Ingesting a poll" means appending an object to that array and committing it.

A poll object looks like this (`scripts/ingestion/types.ts` → `NormalizedPoll`):

```json
{
  "id": "sk-ako-2026-07",
  "countryId": "sk",
  "electionId": "sk-2024",
  "agency": "AKO",
  "fieldworkStart": "2026-07-08",
  "fieldworkEnd": "2026-07-14",
  "sampleSize": 1000,
  "sourceUrl": "https://ako.sk/wp-content/uploads/2026/07/....pdf",
  "results": { "ps": 20.8, "smer": 17.3, "republika": 9.7 },
  "metadata": { "seatProjection": { "ps": 35, "smer": 31, "republika": 17 } }
}
```

Existing modules you will reuse, unchanged:

- `scripts/ingestion/normalize/index.ts` — `normalizePolls(rawPolls, countryId, electionId)`, `resolvePartySlug(name)`, `mapResultsToSlugs(record)` (returns `{ results, unmapped }` — the `unmapped` array is what the PR report needs).
- `scripts/ingestion/validate/index.ts` — `validatePolls(polls, { fieldworkStartMin, fieldworkEndMax })`.
- `scripts/ingestion/fetch/shared.ts` — `fetchWithDelay`, `fetchText`, `fetchBuffer`, `shortFetchError`.
- `scripts/ingestion/types.ts` — `RawPoll`, `NormalizedPoll`, `SkipReason`.
- `src/core/allocation/index.ts` — `allocateSeats(results, totalSeats, thresholdPercent, { asPercentages: true })`.

**Do not reuse `scripts/ingestion/export.ts`.** Its `assignIds()` re-derives the id of *every* poll, so adding a second AKO poll in a month would rename `sk-ako-2026-07` to `sk-ako-2026-07-08`. Poll ids are persisted in the user's browser (`src/features/coalitions/coalitionStorage.ts` stores `pollId` in localStorage), so renaming an existing id silently breaks someone's saved coalition. Task 13 writes an id assigner that only ever names *new* polls.

Tests run with `npm test` (`vitest run`). Vitest picks up `scripts/**/*.test.ts` automatically. Scripts run under `tsx`, so imports use explicit `.ts` extensions — follow that convention exactly; a missing extension fails at runtime.

---

## File structure

**Created:**

| File | Responsibility |
|---|---|
| `scripts/agent/config.ts` | Agencies, model ids, aggregator URL, tolerances, limits |
| `scripts/agent/types.ts` | `Lead`, `Extraction`, `GroundingResult`, `Mismatch`, report types |
| `scripts/agent/claude.ts` | Anthropic SDK wrapper: `ModelClient`, `createModelClient`, `withRetry` |
| `scripts/agent/watermarks.ts` | Latest `fieldworkEnd` per agency |
| `scripts/agent/grounding.ts` | Verify each extracted number appears in the source text |
| `scripts/agent/leads/dateRange.ts` | Parse aggregator fieldwork ranges (`"1–5 Jul 2026"`) |
| `scripts/agent/leads/aggregatorTable.ts` | Parse the Wikipedia polling table into rows |
| `scripts/agent/leads/links.ts` | Harvest links from an agency page (pure) |
| `scripts/agent/leads/triage.ts` | Model-triage harvested links into leads |
| `scripts/agent/extract.ts` | Model extraction of one document into an `Extraction` |
| `scripts/agent/fetchDocument.ts` | Fetch a lead URL as text (HTML or PDF) |
| `scripts/agent/resolveDocument.ts` | Follow a report page to its linked PDF/CSV when it has no table |
| `scripts/agent/crosscheck.ts` | Diff an extraction against an aggregator row |
| `scripts/agent/ids.ts` | Assign a poll id without renaming existing polls |
| `scripts/agent/merge.ts` | Merge new polls into the existing array |
| `scripts/agent/seats.ts` | Seat projection for a single poll |
| `scripts/agent/report.ts` | Build the run report; render the PR body |
| `scripts/agent/run.ts` | Orchestration and CLI only |
| `scripts/agent/README.md` | How the agent works, how to run and debug it |
| `tsconfig.scripts.json` | Type-checks `scripts/` as part of `npm run build` |
| `.github/workflows/poll-watch.yml` | Weekly cron, manual dispatch, branch + PR |

**Modified:** `package.json` (deps + script), `tsconfig.json` (project reference), `scripts/ingestion/normalize/partySlugs.ts` (derive slugs from `parties.json`), `scripts/ingestion/config.ts` + `run.ts` + `types.ts` + `validate/schema.ts` (drop NMS), `src/data/types.ts` (drop NMS), `README.md`, `scripts/ingestion/README.md`.

**Deleted:** `scripts/ingestion/fetchers/nms.ts`, `scripts/ingestion/parsers/nms.ts`.

---

## Task 1: Dependencies and scaffolding

**Files:**
- Modify: `package.json`
- Create: `scripts/agent/config.ts`, `scripts/agent/types.ts`, `scripts/agent/logs/.gitkeep`

- [ ] **Step 1: Install the SDK and promote zod**

`zod` and `cheerio` are already devDependencies. Add the Anthropic SDK:

```bash
npm install --save-dev @anthropic-ai/sdk
```

- [ ] **Step 2: Add the run script**

In `package.json`, add to `"scripts"` after the `"ingest"` line:

```json
    "ingest:agent": "tsx scripts/agent/run.ts",
```

- [ ] **Step 3: Create the config**

Create `scripts/agent/config.ts`:

```typescript
/**
 * Poll watch agent config. Agencies are fixed — this agent never discovers new
 * pollsters, it only looks for newer polls from agencies already in polls.json.
 */
export const AGENT_AGENCIES = ['AKO', 'Focus', 'Ipsos'] as const;

export type AgentAgency = (typeof AGENT_AGENCIES)[number];

export const AGENT_CONFIG = {
  /** Pages listing an agency's releases. Same URLs the deterministic pipeline uses. */
  listUrls: {
    AKO: [
      'https://ako.sk/',
      'https://ako.sk/o-agenture/tlacove-spravy/',
      'https://ako.sk/referencie/prieskumy-volebnych-preferencii/',
    ],
    Focus: ['https://www.focus-research.sk/press-centrum/'],
    Ipsos: ['https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii'],
  } satisfies Record<AgentAgency, string[]>,

  /** Cross-check index. Used to find leads and to verify extracted numbers — never as the source of truth. */
  aggregatorUrl:
    'https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_Slovak_parliamentary_election',

  models: {
    /** Reads number tables out of PDFs. Accuracy is the whole point; ~3 calls a month. */
    extraction: 'claude-opus-5',
    /** Picks plausible poll links out of a list. Cheap, low-stakes, easily verified. */
    triage: 'claude-haiku-4-5',
  },

  /** Party percentages within this many points of the aggregator's are considered equal. */
  crossCheckTolerance: 0.1,

  /** Characters either side of a party name searched for its percentage. */
  groundingWindow: 160,

  /** Safety valve: a run that suddenly finds dozens of leads is a bug, not a windfall. */
  maxLeadsPerRun: 12,

  /** Documents longer than this are reported, never silently truncated. */
  maxDocChars: 200_000,
} as const;
```

- [ ] **Step 4: Create the shared types**

Create `scripts/agent/types.ts`:

```typescript
import type { NormalizedPoll } from '../ingestion/types.ts';
import type { AgentAgency } from './config.ts';

/** A page that might contain a poll newer than the agency's watermark. */
export interface Lead {
  agency: AgentAgency;
  url: string;
  /** Where the lead came from — used in the report so a false lead is traceable. */
  discoveredBy: 'site' | 'aggregator';
  /** Link text or aggregator row summary, for the report. */
  label: string;
}

/** One party row as the model read it, party label left verbatim. */
export interface ExtractedResult {
  party: string;
  percent: number;
}

/** What the model returns for a single document. */
export interface Extraction {
  fieldworkStart: string;
  fieldworkEnd: string;
  sampleSize: number;
  results: ExtractedResult[];
  notes: string;
}

/** Whether an extracted (party, value) pair is actually present in the source text. */
export interface GroundingResult {
  party: string;
  value: number;
  grounded: boolean;
  reason: string;
}

/** A row of the aggregator table. `results` keys are canonical slugs. */
export interface AggregatorRow {
  agency: string;
  fieldworkStart: string;
  fieldworkEnd: string;
  sampleSize: number | null;
  results: Record<string, number>;
}

/** A disagreement between the extraction and the aggregator. */
export interface Mismatch {
  field: string;
  extracted: string | number | null;
  aggregator: string | number | null;
}

/** Everything that happened to one lead. This is the handoff artifact. */
export interface LeadReport {
  agency: AgentAgency;
  url: string;
  discoveredBy: 'site' | 'aggregator';
  label: string;
  outcome: 'added' | 'skipped' | 'failed';
  /** Why it was skipped or failed. Empty when added. */
  reason: string;
  extraction: Extraction | null;
  /** Party labels the slug mapper did not recognise, with their values. */
  unmapped: ExtractedResult[];
  grounding: GroundingResult[];
  mismatches: Mismatch[];
  pollId: string | null;
}

/** The whole run. Written to scripts/agent/logs/agent-run-YYYY-MM-DD.json. */
export interface AgentRunReport {
  runDate: string;
  watermarks: Record<string, string | null>;
  leadCount: number;
  leads: LeadReport[];
  addedPolls: NormalizedPoll[];
}
```

- [ ] **Step 5: Create the logs directory**

```bash
mkdir -p scripts/agent/logs && touch scripts/agent/logs/.gitkeep
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/agent
git commit -m "Add poll watch agent scaffolding: config, types, deps"
```

---

## Task 2: Type-check the scripts directory

Right now `npm run build` type-checks only `src` and `vite.config.ts` — nothing under `scripts/` is ever type-checked, and `tsx` strips types at runtime without checking them. Every later task benefits from this being in place first.

**Files:**
- Create: `tsconfig.scripts.json`
- Modify: `tsconfig.json`

- [ ] **Step 1: Create the scripts tsconfig**

Create `tsconfig.scripts.json` (mirrors `tsconfig.node.json`, but covers `scripts` and the `src` files those scripts import):

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.scripts.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "types": ["node"],
    "skipLibCheck": true,

    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "resolveJsonModule": true,

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true
  },
  "include": ["scripts", "src/core", "src/data"]
}
```

- [ ] **Step 2: Reference it from the root tsconfig**

Replace the contents of `tsconfig.json` with:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.scripts.json" }
  ]
}
```

- [ ] **Step 3: Run the type check**

Run: `npx tsc -b`
Expected: it may report pre-existing errors in `scripts/ingestion/`. Fix only what is genuinely broken (usually an unused local or an implicit `any`); do not restructure the ingestion pipeline. Re-run until clean.

- [ ] **Step 4: Verify the build still passes**

Run: `npm run build`
Expected: exit 0, `dist/koalka` written.

- [ ] **Step 5: Commit**

```bash
git add tsconfig.json tsconfig.scripts.json scripts src
git commit -m "Type-check scripts/ as part of the build"
```

---

## Task 3: Derive party slugs from parties.json

`CANONICAL_PARTY_SLUGS` in `scripts/ingestion/normalize/partySlugs.ts` is a hand-maintained copy of the ids in `public/data/sk/parties.json`, and it has already drifted — `strana_vidieka` and `pravo_na_pravdu` were added to `parties.json` by hand and never here. For the agent, that drift means a party the app *does* track gets reported as unmapped and dropped from the poll.

**Files:**
- Modify: `scripts/ingestion/normalize/partySlugs.ts:1-45`
- Test: `scripts/ingestion/normalize/partySlugs.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/ingestion/normalize/partySlugs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CANONICAL_PARTY_SLUGS, resolvePartySlug } from './partySlugs.ts';

describe('CANONICAL_PARTY_SLUGS', () => {
  it('contains every party id in parties.json, including recently added ones', () => {
    expect(CANONICAL_PARTY_SLUGS).toContain('strana_vidieka');
    expect(CANONICAL_PARTY_SLUGS).toContain('pravo_na_pravdu');
    expect(CANONICAL_PARTY_SLUGS).toContain('smer');
  });
});

describe('resolvePartySlug', () => {
  it('resolves a party added to parties.json but never aliased by hand', () => {
    expect(resolvePartySlug('Strana vidieka')).toBe('strana_vidieka');
    expect(resolvePartySlug('Právo na pravdu')).toBe('pravo_na_pravdu');
  });

  it('still resolves the hand-curated aliases', () => {
    expect(resolvePartySlug('SMER-SSD')).toBe('smer');
    expect(resolvePartySlug('Hnutie Slovensko')).toBe('olano');
    expect(resolvePartySlug('Szövetség')).toBe('madarska_aliancia');
    expect(resolvePartySlug('Progresívne Slovensko')).toBe('ps');
  });

  it('returns null for a genuinely unknown party', () => {
    expect(resolvePartySlug('Strana nezmyslov 2026')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/ingestion/normalize/partySlugs.test.ts`
Expected: FAIL — `expected [ ... ] to contain 'strana_vidieka'`.

- [ ] **Step 3: Derive the slugs**

In `scripts/ingestion/normalize/partySlugs.ts`, replace the hardcoded array at the top:

```typescript
import type { PartyId } from "../../../src/data/types.ts";

/** Canonical party slugs for Slovak NRSR (align with public/data/sk/parties.json) */
export const CANONICAL_PARTY_SLUGS: PartyId[] = [
  "smer",
  "ps",
  // ... rest of the hardcoded list
];
```

with a read of `parties.json`:

```typescript
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PartyId } from "../../../src/data/types.ts";

interface PartyEntry {
  id: string;
  name: string;
  shortName: string;
  abbr?: string;
}

const PARTIES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../public/data/sk/parties.json",
);

const PARTIES = JSON.parse(readFileSync(PARTIES_PATH, "utf-8")) as PartyEntry[];

/**
 * Canonical party slugs, derived from public/data/sk/parties.json so this list can
 * never drift from the data the app actually renders.
 */
export const CANONICAL_PARTY_SLUGS: PartyId[] = PARTIES.map((p) => p.id);
```

- [ ] **Step 4: Register each party's own names as aliases**

Immediately after the `function add(...)` declaration (and **before** the first hand-written `add("smer", ...)` call, so the curated aliases win any collision), insert:

```typescript
// Every party's own id, name, shortName and abbr resolve to itself. Hand-curated
// aliases below are registered afterwards and take precedence on collision.
for (const p of PARTIES) {
  const names = [p.name, p.shortName, ...(p.abbr != null ? [p.abbr] : [])];
  add(p.id as PartyId, ...names);
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run scripts/ingestion/normalize/partySlugs.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Run the whole suite and the type check**

Run: `npm test && npx tsc -b`
Expected: all pass. If a curated alias broke, a party's `shortName` in `parties.json` collides with a curated alias — move that party's registration after the curated block rather than deleting the alias.

- [ ] **Step 7: Commit**

```bash
git add scripts/ingestion/normalize/partySlugs.ts scripts/ingestion/normalize/partySlugs.test.ts
git commit -m "Derive canonical party slugs from parties.json"
```

---

## Task 4: Watermarks

**Files:**
- Create: `scripts/agent/watermarks.ts`
- Test: `scripts/agent/watermarks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/watermarks.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeWatermarks } from './watermarks.ts';

const polls = [
  { agency: 'AKO', fieldworkEnd: '2026-06-10' },
  { agency: 'AKO', fieldworkEnd: '2026-07-14' },
  { agency: 'Focus', fieldworkEnd: '2026-06-29' },
];

describe('computeWatermarks', () => {
  it('returns the latest fieldworkEnd per agency', () => {
    const result = computeWatermarks(polls, ['AKO', 'Focus', 'Ipsos']);
    expect(result.AKO).toBe('2026-07-14');
    expect(result.Focus).toBe('2026-06-29');
  });

  it('returns null for an agency with no polls', () => {
    const result = computeWatermarks(polls, ['AKO', 'Focus', 'Ipsos']);
    expect(result.Ipsos).toBeNull();
  });

  it('ignores agencies that are not being watched', () => {
    const result = computeWatermarks(
      [...polls, { agency: 'NMS', fieldworkEnd: '2026-08-01' }],
      ['AKO', 'Focus', 'Ipsos'],
    );
    expect(Object.keys(result).sort()).toEqual(['AKO', 'Focus', 'Ipsos']);
  });

  it('returns null for every agency when there are no polls at all', () => {
    const result = computeWatermarks([], ['AKO']);
    expect(result.AKO).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/watermarks.test.ts`
Expected: FAIL — cannot find module `./watermarks.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/watermarks.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/watermarks.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/watermarks.ts scripts/agent/watermarks.test.ts
git commit -m "Add per-agency poll watermarks"
```

---

## Task 5: Grounding check

This is the guard against a hallucinated digit: every `(party, percentage)` the model returns must actually appear in the fetched document, near that party's name. Pure string matching — no second model call.

**Files:**
- Create: `scripts/agent/grounding.ts`
- Test: `scripts/agent/grounding.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/grounding.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { checkGrounding, numberAppears } from './grounding.ts';

const DOC = `
Volebné preferencie politických strán, júl 2026
Progresívne Slovensko 20,8 %
SMER-SSD 17,3 %
OĽANO 8,0 %
Strana vidieka 0,3 %
Vzorka: 1000 respondentov
`;

describe('numberAppears', () => {
  it('matches a comma decimal', () => {
    expect(numberAppears('SMER-SSD 17,3 %', 17.3)).toBe(true);
  });

  it('matches a dot decimal', () => {
    expect(numberAppears('SMER-SSD 17.3 %', 17.3)).toBe(true);
  });

  it('matches an integer written with one decimal place', () => {
    expect(numberAppears('OĽANO 8,0 %', 8)).toBe(true);
  });

  it('rejects a near miss', () => {
    expect(numberAppears('SMER-SSD 17,3 %', 17.8)).toBe(false);
  });

  it('rejects a value that is only a substring of a longer number', () => {
    expect(numberAppears('Vzorka: 1017,8 osôb', 17.8)).toBe(false);
    expect(numberAppears('celkom 80 mandátov', 8)).toBe(false);
  });
});

describe('checkGrounding', () => {
  it('grounds every value that is present next to its party', () => {
    const results = checkGrounding(
      DOC,
      [
        { party: 'Progresívne Slovensko', percent: 20.8 },
        { party: 'SMER-SSD', percent: 17.3 },
        { party: 'OĽANO', percent: 8 },
      ],
    );
    expect(results.every((r) => r.grounded)).toBe(true);
  });

  it('matches party names regardless of diacritics and case', () => {
    const [result] = checkGrounding(DOC, [{ party: 'progresivne slovensko', percent: 20.8 }]);
    expect(result.grounded).toBe(true);
  });

  it('flags a value the document does not contain', () => {
    const [result] = checkGrounding(DOC, [{ party: 'SMER-SSD', percent: 17.8 }]);
    expect(result.grounded).toBe(false);
    expect(result.reason).toMatch(/not found near/i);
  });

  it('flags a party the document does not mention', () => {
    const [result] = checkGrounding(DOC, [{ party: 'Demokrati', percent: 5.8 }]);
    expect(result.grounded).toBe(false);
    expect(result.reason).toMatch(/party name not found/i);
  });

  it('does not ground a value that appears only far away from the party name', () => {
    const doc = `Demokrati 5,8 %${' '.repeat(500)}42,1`;
    const [result] = checkGrounding(doc, [{ party: 'Demokrati', percent: 42.1 }], 160);
    expect(result.grounded).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/grounding.test.ts`
Expected: FAIL — cannot find module `./grounding.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/grounding.ts`:

```typescript
import { AGENT_CONFIG } from './config.ts';
import type { ExtractedResult, GroundingResult } from './types.ts';

/** Lowercase, strip diacritics, collapse whitespace — so PDF line breaks don't matter. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every way an agency might print this number: 17.8, 17,8, and for integers also 8,0. */
function numberVariants(value: number): string[] {
  const plain = String(value);
  const oneDecimal = value.toFixed(1);
  return [
    ...new Set([
      plain,
      plain.replace('.', ','),
      oneDecimal,
      oneDecimal.replace('.', ','),
    ]),
  ];
}

/**
 * True when `value` occurs in `text` as a whole number token — not as part of a longer
 * one. "1017,8" must not ground 17.8, and "80" must not ground 8.
 */
export function numberAppears(text: string, value: number): boolean {
  return numberVariants(value).some((variant) =>
    new RegExp(`(?<![\\d.,])${escapeRegExp(variant)}(?![\\d.,]*\\d)`).test(text),
  );
}

/**
 * For each extracted party result, check the number actually appears in the source text
 * within `window` characters of the party's name. A failure is a flag for the PR, never
 * a block: some agencies publish values only inside chart images.
 */
export function checkGrounding(
  docText: string,
  results: readonly ExtractedResult[],
  window: number = AGENT_CONFIG.groundingWindow,
): GroundingResult[] {
  const doc = fold(docText);

  return results.map(({ party, percent }) => {
    const needle = fold(party);
    const at = doc.indexOf(needle);

    if (at < 0) {
      return {
        party,
        value: percent,
        grounded: false,
        reason: 'party name not found in source text',
      };
    }

    const slice = doc.slice(
      Math.max(0, at - window),
      at + needle.length + window,
    );

    return numberAppears(slice, percent)
      ? { party, value: percent, grounded: true, reason: '' }
      : {
          party,
          value: percent,
          grounded: false,
          reason: `value ${percent} not found near "${party}" in source text`,
        };
  });
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/grounding.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/grounding.ts scripts/agent/grounding.test.ts
git commit -m "Add source-grounding check for extracted poll values"
```

---

## Task 6: Aggregator fieldwork date ranges

The Wikipedia table writes fieldwork as `"1–5 Jul 2026"` or `"26 Jun – 1 Jul 2026"`. Parsing that is fiddly enough to deserve its own tested module.

**Files:**
- Create: `scripts/agent/leads/dateRange.ts`
- Test: `scripts/agent/leads/dateRange.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/leads/dateRange.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseFieldworkRange } from './dateRange.ts';

describe('parseFieldworkRange', () => {
  it('parses a same-month range with an en dash', () => {
    expect(parseFieldworkRange('1–5 Jul 2026')).toEqual({
      start: '2026-07-01',
      end: '2026-07-05',
    });
  });

  it('parses a range that crosses a month boundary', () => {
    expect(parseFieldworkRange('26 Jun – 1 Jul 2026')).toEqual({
      start: '2026-06-26',
      end: '2026-07-01',
    });
  });

  it('parses a range that crosses a year boundary with both years written', () => {
    expect(parseFieldworkRange('28 Dec 2025 – 3 Jan 2026')).toEqual({
      start: '2025-12-28',
      end: '2026-01-03',
    });
  });

  it('infers the earlier year when a range crosses new year without repeating it', () => {
    expect(parseFieldworkRange('30 Dec – 3 Jan 2026')).toEqual({
      start: '2025-12-30',
      end: '2026-01-03',
    });
  });

  it('parses a single day', () => {
    expect(parseFieldworkRange('5 Jul 2026')).toEqual({
      start: '2026-07-05',
      end: '2026-07-05',
    });
  });

  it('tolerates a plain hyphen and extra whitespace', () => {
    expect(parseFieldworkRange('  8 - 14  Jul 2026 ')).toEqual({
      start: '2026-07-08',
      end: '2026-07-14',
    });
  });

  it('returns null for text it cannot parse', () => {
    expect(parseFieldworkRange('summer 2026')).toBeNull();
    expect(parseFieldworkRange('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/leads/dateRange.test.ts`
Expected: FAIL — cannot find module `./dateRange.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/leads/dateRange.ts`:

```typescript
/** ISO date range, both ends inclusive. */
export interface DateRange {
  start: string;
  end: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function monthNumber(name: string): number | null {
  return MONTHS[name.slice(0, 3).toLowerCase()] ?? null;
}

/** Parse one side of a range. Month and year fall back to the other side's when absent. */
function parseSide(
  part: string,
  fallbackMonth: number | null,
  fallbackYear: number | null,
): string | null {
  const match = /^(\d{1,2})(?:\s+([A-Za-z]+))?(?:\s+(\d{4}))?$/.exec(part);
  if (!match) return null;

  const day = Number(match[1]);
  const month = match[2] != null ? monthNumber(match[2]) : fallbackMonth;
  const year = match[3] != null ? Number(match[3]) : fallbackYear;

  if (month == null || year == null) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Parse an aggregator fieldwork cell such as "1–5 Jul 2026", "26 Jun – 1 Jul 2026",
 * "28 Dec 2025 – 3 Jan 2026" or a single "5 Jul 2026". Returns null when the text does
 * not look like a date range at all — the caller reports it rather than guessing.
 */
export function parseFieldworkRange(raw: string): DateRange | null {
  const text = raw
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (text === '') return null;

  const parts = text.split('-').map((p) => p.trim()).filter((p) => p !== '');

  if (parts.length === 1) {
    const day = parseSide(parts[0]!, null, null);
    return day == null ? null : { start: day, end: day };
  }
  if (parts.length !== 2) return null;

  const end = parseSide(parts[1]!, null, null);
  if (end == null) return null;

  const endMonth = Number(end.slice(5, 7));
  const endYear = Number(end.slice(0, 4));

  let start = parseSide(parts[0]!, endMonth, endYear);
  if (start == null) return null;

  // "30 Dec – 3 Jan 2026": the start month is written but its year is not, and taking
  // the end's year puts the start after the end. The range began the previous year.
  if (start > end) {
    start = parseSide(parts[0]!, endMonth, endYear - 1);
    if (start == null || start > end) return null;
  }

  return { start, end };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/leads/dateRange.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/leads/dateRange.ts scripts/agent/leads/dateRange.test.ts
git commit -m "Parse aggregator fieldwork date ranges"
```

---

## Task 7: Aggregator table parsing

Turns the Wikipedia polling table into rows the agent can use both as leads and as a cross-check. Party column headers are mapped through the same `resolvePartySlug` the ingestion pipeline uses, so this file never learns party names of its own.

**Files:**
- Create: `scripts/agent/leads/aggregatorTable.ts`
- Test: `scripts/agent/leads/aggregatorTable.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/leads/aggregatorTable.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseAggregatorRows } from './aggregatorTable.ts';

const HTML = `
<table class="wikitable">
  <tr>
    <th>Polling firm</th><th>Fieldwork date</th><th>Sample size</th>
    <th>PS</th><th>SMER</th><th>Hlas</th>
  </tr>
  <tr>
    <td>AKO</td><td>8–14 Jul 2026</td><td>1,000</td>
    <td>20.8</td><td>17.3</td><td>8.5</td>
  </tr>
  <tr>
    <td>Focus<sup>[1]</sup></td><td>22–29 Jun 2026</td><td>1,027</td>
    <td>21.4</td><td>16.9</td><td>9.1</td>
  </tr>
  <tr>
    <td>Median SK</td><td>1–4 Jun 2026</td><td>800</td>
    <td>19.0</td><td>18.0</td><td>9.5</td>
  </tr>
  <tr>
    <td>Ipsos</td><td>who knows</td><td>900</td>
    <td>20.0</td><td>17.0</td><td>9.0</td>
  </tr>
</table>
`;

describe('parseAggregatorRows', () => {
  it('parses a row into agency, dates, sample size and slug-keyed results', () => {
    const { rows } = parseAggregatorRows(HTML, ['AKO', 'Focus', 'Ipsos']);
    const ako = rows.find((r) => r.agency === 'AKO');
    expect(ako).toEqual({
      agency: 'AKO',
      fieldworkStart: '2026-07-08',
      fieldworkEnd: '2026-07-14',
      sampleSize: 1000,
      results: { ps: 20.8, smer: 17.3, hlas: 8.5 },
    });
  });

  it('strips footnote markers from the agency cell', () => {
    const { rows } = parseAggregatorRows(HTML, ['AKO', 'Focus', 'Ipsos']);
    expect(rows.some((r) => r.agency === 'Focus')).toBe(true);
  });

  it('ignores agencies that are not watched', () => {
    const { rows } = parseAggregatorRows(HTML, ['AKO', 'Focus', 'Ipsos']);
    expect(rows.some((r) => r.agency === 'Median SK')).toBe(false);
  });

  it('skips a row with an unparseable date and says why', () => {
    const { rows, skipped } = parseAggregatorRows(HTML, ['AKO', 'Focus', 'Ipsos']);
    expect(rows.some((r) => r.agency === 'Ipsos')).toBe(false);
    expect(skipped.some((s) => s.reason.includes('fieldwork'))).toBe(true);
  });

  it('returns no rows when the page has no usable table', () => {
    const { rows } = parseAggregatorRows('<p>nothing here</p>', ['AKO']);
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/leads/aggregatorTable.test.ts`
Expected: FAIL — cannot find module `./aggregatorTable.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/leads/aggregatorTable.ts`:

```typescript
import * as cheerio from 'cheerio';
import { resolvePartySlug } from '../../ingestion/normalize/index.ts';
import type { AggregatorRow } from '../types.ts';
import { parseFieldworkRange } from './dateRange.ts';

export interface AggregatorParseResult {
  rows: AggregatorRow[];
  skipped: { text: string; reason: string }[];
}

/** Column meanings we care about; everything else is either a party or ignored. */
interface ColumnMap {
  agency: number;
  fieldwork: number;
  sample: number | null;
  parties: Map<number, string>;
}

const AGENCY_HEADER = /polling firm|pollster|agency|agent/i;
const FIELDWORK_HEADER = /fieldwork|date|obdobie/i;
const SAMPLE_HEADER = /sample|vzork|^n$/i;

function cellText(text: string): string {
  return text.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
}

function toNumber(text: string): number | null {
  const cleaned = cellText(text).replace(/\s/g, '').replace(',', '.').replace(/%$/, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function toSampleSize(text: string): number | null {
  const digits = cellText(text).replace(/[^\d]/g, '');
  return digits === '' ? null : Number(digits);
}

function readHeader(headers: string[]): ColumnMap | null {
  const map: ColumnMap = { agency: -1, fieldwork: -1, sample: null, parties: new Map() };

  headers.forEach((header, index) => {
    if (map.agency < 0 && AGENCY_HEADER.test(header)) {
      map.agency = index;
      return;
    }
    if (map.fieldwork < 0 && FIELDWORK_HEADER.test(header)) {
      map.fieldwork = index;
      return;
    }
    if (map.sample == null && SAMPLE_HEADER.test(header)) {
      map.sample = index;
      return;
    }
    const slug = resolvePartySlug(header);
    if (slug != null) map.parties.set(index, slug);
  });

  if (map.agency < 0 || map.fieldwork < 0 || map.parties.size === 0) return null;
  return map;
}

/**
 * Parse the aggregator's polling table into rows for the watched agencies. Rows that
 * cannot be parsed are reported, never guessed at. Results are keyed by canonical slug
 * via resolvePartySlug, so this module holds no party knowledge of its own.
 */
export function parseAggregatorRows(
  html: string,
  agencies: readonly string[],
): AggregatorParseResult {
  const $ = cheerio.load(html);
  const rows: AggregatorRow[] = [];
  const skipped: { text: string; reason: string }[] = [];

  $('table').each((_, table) => {
    const trs = $(table).find('tr').toArray();
    if (trs.length < 2) return;

    const headers = $(trs[0]!).find('th,td').toArray().map((c) => cellText($(c).text()));
    const columns = readHeader(headers);
    if (columns == null) return;

    for (const tr of trs.slice(1)) {
      const cells = $(tr).find('th,td').toArray().map((c) => cellText($(c).text()));
      if (cells.length <= columns.fieldwork) continue;

      const agencyText = cells[columns.agency] ?? '';
      const agency = agencies.find((a) =>
        agencyText.toLowerCase().includes(a.toLowerCase()),
      );
      if (agency == null) continue;

      const range = parseFieldworkRange(cells[columns.fieldwork] ?? '');
      if (range == null) {
        skipped.push({
          text: cells.join(' | '),
          reason: `unparseable fieldwork cell: "${cells[columns.fieldwork] ?? ''}"`,
        });
        continue;
      }

      const results: Record<string, number> = {};
      for (const [index, slug] of columns.parties) {
        const value = toNumber(cells[index] ?? '');
        if (value != null) results[slug] = value;
      }

      rows.push({
        agency,
        fieldworkStart: range.start,
        fieldworkEnd: range.end,
        sampleSize: columns.sample == null ? null : toSampleSize(cells[columns.sample] ?? ''),
        results,
      });
    }
  });

  return { rows, skipped };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/leads/aggregatorTable.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Check the parser against the live page**

The inline fixture above is a simplification. Save a real snapshot and confirm the parser finds recent rows:

```bash
curl -sL "https://en.wikipedia.org/wiki/Opinion_polling_for_the_next_Slovak_parliamentary_election" -o /tmp/aggregator.html
npx tsx -e "import {readFileSync} from 'node:fs'; import {parseAggregatorRows} from './scripts/agent/leads/aggregatorTable.ts'; const r = parseAggregatorRows(readFileSync('/tmp/aggregator.html','utf-8'), ['AKO','Focus','Ipsos']); console.log(r.rows.slice(0,5)); console.log('rows:', r.rows.length, 'skipped:', r.skipped.length);"
```

Expected: several rows with plausible 2026 dates and slug-keyed results.

If it prints zero rows, the real table's headers differ from the fixture's. Read the saved HTML, widen `AGENCY_HEADER` / `FIELDWORK_HEADER` / `SAMPLE_HEADER` to match what's actually there, and add a regression test using the real header row (copy just the `<tr>` of headers plus two data rows into the test file — do not commit the whole snapshot).

If the page has moved or no longer exists, stop and report it: the aggregator is a cross-check, and a wrong URL would silently disable it. Do not substitute a different site without asking.

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/leads/aggregatorTable.ts scripts/agent/leads/aggregatorTable.test.ts
git commit -m "Parse the aggregator polling table into cross-check rows"
```

---

## Task 8: Cross-check

**Files:**
- Create: `scripts/agent/crosscheck.ts`
- Test: `scripts/agent/crosscheck.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/crosscheck.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { crossCheck } from './crosscheck.ts';
import type { AggregatorRow } from './types.ts';

const row: AggregatorRow = {
  agency: 'AKO',
  fieldworkStart: '2026-07-08',
  fieldworkEnd: '2026-07-14',
  sampleSize: 1000,
  results: { ps: 20.8, smer: 17.3, hlas: 8.5 },
};

const poll = {
  fieldworkStart: '2026-07-08',
  fieldworkEnd: '2026-07-14',
  sampleSize: 1000,
  results: { ps: 20.8, smer: 17.3, hlas: 8.5 },
};

describe('crossCheck', () => {
  it('reports nothing when the extraction matches', () => {
    expect(crossCheck(poll, row)).toEqual([]);
  });

  it('ignores a difference within tolerance', () => {
    const result = crossCheck({ ...poll, results: { ...poll.results, ps: 20.85 } }, row);
    expect(result).toEqual([]);
  });

  it('flags a party value outside tolerance', () => {
    const result = crossCheck({ ...poll, results: { ...poll.results, smer: 17.8 } }, row);
    expect(result).toEqual([
      { field: 'results.smer', extracted: 17.8, aggregator: 17.3 },
    ]);
  });

  it('flags mismatched fieldwork dates', () => {
    const result = crossCheck({ ...poll, fieldworkEnd: '2026-07-15' }, row);
    expect(result).toContainEqual({
      field: 'fieldworkEnd',
      extracted: '2026-07-15',
      aggregator: '2026-07-14',
    });
  });

  it('flags a mismatched sample size', () => {
    const result = crossCheck({ ...poll, sampleSize: 1100 }, row);
    expect(result).toContainEqual({
      field: 'sampleSize',
      extracted: 1100,
      aggregator: 1000,
    });
  });

  it('ignores the sample size when the aggregator has none', () => {
    const result = crossCheck({ ...poll, sampleSize: 1100 }, { ...row, sampleSize: null });
    expect(result).toEqual([]);
  });

  it('flags a significant party the extraction is missing entirely', () => {
    const result = crossCheck(
      { ...poll, results: { ps: 20.8, smer: 17.3 } },
      row,
    );
    expect(result).toContainEqual({
      field: 'results.hlas',
      extracted: null,
      aggregator: 8.5,
    });
  });

  it('does not flag a missing sub-1% party', () => {
    const result = crossCheck(poll, {
      ...row,
      results: { ...row.results, strana_vidieka: 0.3 },
    });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/crosscheck.test.ts`
Expected: FAIL — cannot find module `./crosscheck.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/crosscheck.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/crosscheck.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/crosscheck.ts scripts/agent/crosscheck.test.ts
git commit -m "Add aggregator cross-check"
```

---

## Task 9: Harvest links from an agency page

**Files:**
- Create: `scripts/agent/leads/links.ts`
- Test: `scripts/agent/leads/links.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/leads/links.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { harvestLinks } from './links.ts';

const HTML = `
<html><body>
  <a href="/wp-content/uploads/2026/07/ag.AKO_VOLEBNE-PREF-JUL-2026.pdf">Volebné preferencie júl 2026</a>
  <a href="https://ako.sk/o-agenture/">O agentúre</a>
  <a href="#top">Hore</a>
  <a href="mailto:info@ako.sk">Napíšte nám</a>
  <a href="/wp-content/uploads/2026/07/ag.AKO_VOLEBNE-PREF-JUL-2026.pdf">rovnaký odkaz znova</a>
  <a href="/kontakt"></a>
</body></html>
`;

describe('harvestLinks', () => {
  it('resolves relative hrefs against the page URL', () => {
    const links = harvestLinks(HTML, 'https://ako.sk/tlacove-spravy/');
    expect(links[0]!.url).toBe(
      'https://ako.sk/wp-content/uploads/2026/07/ag.AKO_VOLEBNE-PREF-JUL-2026.pdf',
    );
  });

  it('keeps the link text, collapsed', () => {
    const links = harvestLinks(HTML, 'https://ako.sk/tlacove-spravy/');
    expect(links[0]!.text).toBe('Volebné preferencie júl 2026');
  });

  it('drops mailto and pure-fragment links', () => {
    const links = harvestLinks(HTML, 'https://ako.sk/tlacove-spravy/');
    expect(links.some((l) => l.url.startsWith('mailto:'))).toBe(false);
    expect(links.some((l) => l.url.endsWith('#top'))).toBe(false);
  });

  it('deduplicates by url', () => {
    const links = harvestLinks(HTML, 'https://ako.sk/tlacove-spravy/');
    const pdfs = links.filter((l) => l.url.endsWith('.pdf'));
    expect(pdfs).toHaveLength(1);
  });

  it('keeps a link with no text', () => {
    const links = harvestLinks(HTML, 'https://ako.sk/tlacove-spravy/');
    expect(links.some((l) => l.url === 'https://ako.sk/kontakt')).toBe(true);
  });

  it('returns an empty array for a page with no links', () => {
    expect(harvestLinks('<p>nič</p>', 'https://ako.sk/')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/leads/links.test.ts`
Expected: FAIL — cannot find module `./links.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/leads/links.ts`:

```typescript
import * as cheerio from 'cheerio';

export interface HarvestedLink {
  url: string;
  text: string;
}

/** Link text longer than this is noise in the triage prompt. */
const MAX_TEXT = 200;

/**
 * Every http(s) link on a page, absolute-resolved and deduplicated. Deliberately dumb:
 * deciding which of these is a poll release is the model's job, and keeping this step
 * free of pattern-matching is what makes the agent survive a URL scheme change.
 */
export function harvestLinks(html: string, baseUrl: string): HarvestedLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, HarvestedLink>();

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href') ?? '';
    if (href.trim() === '' || href.startsWith('#')) return;

    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      return;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;

    resolved.hash = '';
    const url = resolved.href;
    if (seen.has(url)) return;

    const text = $(element).text().replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    seen.set(url, { url, text });
  });

  return [...seen.values()];
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/leads/links.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/leads/links.ts scripts/agent/leads/links.test.ts
git commit -m "Harvest links from agency list pages"
```

---

## Task 10: Claude client wrapper

One place that knows about the Anthropic SDK, so every other module takes a `ModelClient` and is testable with a fake.

**Files:**
- Create: `scripts/agent/claude.ts`
- Test: `scripts/agent/claude.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/claude.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { isFatalApiError, withRetry } from './claude.ts';

function httpError(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

describe('isFatalApiError', () => {
  it('treats a 400 as fatal', () => {
    expect(isFatalApiError(httpError(400))).toBe(true);
  });

  it('treats a 429 as retryable', () => {
    expect(isFatalApiError(httpError(429))).toBe(false);
  });

  it('treats a 500 as retryable', () => {
    expect(isFatalApiError(httpError(500))).toBe(false);
  });

  it('treats a network error with no status as retryable', () => {
    expect(isFatalApiError(new Error('socket hang up'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpError(500))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelayMs: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after the configured number of attempts', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(500));
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow('HTTP 500');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a fatal error', async () => {
    const fn = vi.fn().mockRejectedValue(httpError(400));
    await expect(withRetry(fn, { baseDelayMs: 0 })).rejects.toThrow('HTTP 400');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/claude.test.ts`
Expected: FAIL — cannot find module `./claude.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/claude.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  isFatal?: (error: unknown) => boolean;
}

/**
 * A 4xx other than rate limiting means the request itself is wrong — retrying just burns
 * time and money. Everything else (429, 5xx, network) is worth another attempt.
 */
export function isFatalApiError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 429;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 2000;
  const isFatal = options.isFatal ?? isFatalApiError;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (isFatal(error) || attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt));
    }
  }
  throw lastError;
}

export interface ParseJsonParams<T> {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
}

/** The only interface the rest of the agent knows about. Tests pass a fake. */
export interface ModelClient {
  parseJson<T>(params: ParseJsonParams<T>): Promise<T | null>;
}

/**
 * Anthropic-backed ModelClient. Credentials come from ANTHROPIC_API_KEY in the
 * environment; the SDK reads it itself.
 */
export function createModelClient(client: Anthropic = new Anthropic()): ModelClient {
  return {
    async parseJson<T>({
      model,
      system,
      user,
      schema,
      maxTokens = 16000,
      effort = 'high',
    }: ParseJsonParams<T>): Promise<T | null> {
      const response = await withRetry(() =>
        client.messages.parse({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
          output_config: {
            format: zodOutputFormat(schema as never),
            effort,
          },
        }),
      );
      return (response.parsed_output as T | null) ?? null;
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/claude.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: clean. If `zodOutputFormat` rejects the cast, replace `schema as never` with `schema as unknown as Parameters<typeof zodOutputFormat>[0]` — do not loosen the exported `ParseJsonParams` types to `any`.

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/claude.ts scripts/agent/claude.test.ts
git commit -m "Add Claude client wrapper with retry"
```

---

## Task 11: Link triage

**Files:**
- Create: `scripts/agent/leads/triage.ts`
- Test: `scripts/agent/leads/triage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/leads/triage.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { triageLinks } from './triage.ts';
import type { ModelClient } from '../claude.ts';

const links = [
  { url: 'https://ako.sk/2026/07/pref-jul-2026.pdf', text: 'Volebné preferencie júl 2026' },
  { url: 'https://ako.sk/o-agenture/', text: 'O agentúre' },
];

function fakeClient(candidates: { url: string; why: string }[]): ModelClient {
  return { parseJson: vi.fn().mockResolvedValue({ candidates }) };
}

describe('triageLinks', () => {
  it('returns the candidates the model picked', async () => {
    const client = fakeClient([{ url: links[0]!.url, why: 'July 2026 preferences PDF' }]);
    const result = await triageLinks({
      agency: 'AKO',
      watermark: '2026-06-10',
      links,
      client,
      model: 'test-model',
    });
    expect(result).toEqual([{ url: links[0]!.url, why: 'July 2026 preferences PDF' }]);
  });

  it('drops a url the model invented', async () => {
    const client = fakeClient([
      { url: links[0]!.url, why: 'real' },
      { url: 'https://ako.sk/2026/08/does-not-exist.pdf', why: 'hallucinated' },
    ]);
    const result = await triageLinks({
      agency: 'AKO',
      watermark: '2026-06-10',
      links,
      client,
      model: 'test-model',
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe(links[0]!.url);
  });

  it('returns an empty array when the model returns nothing', async () => {
    const client = fakeClient([]);
    const result = await triageLinks({
      agency: 'AKO',
      watermark: null,
      links,
      client,
      model: 'test-model',
    });
    expect(result).toEqual([]);
  });

  it('returns an empty array without calling the model when there are no links', async () => {
    const client = fakeClient([]);
    const result = await triageLinks({
      agency: 'AKO',
      watermark: null,
      links: [],
      client,
      model: 'test-model',
    });
    expect(result).toEqual([]);
    expect(client.parseJson).not.toHaveBeenCalled();
  });

  it('returns an empty array when the model returns null', async () => {
    const client: ModelClient = { parseJson: vi.fn().mockResolvedValue(null) };
    const result = await triageLinks({
      agency: 'AKO',
      watermark: null,
      links,
      client,
      model: 'test-model',
    });
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/leads/triage.test.ts`
Expected: FAIL — cannot find module `./triage.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/leads/triage.ts`:

```typescript
import { z } from 'zod';
import type { ModelClient } from '../claude.ts';
import type { AgentAgency } from '../config.ts';
import type { HarvestedLink } from './links.ts';

const TriageSchema = z.object({
  candidates: z
    .array(
      z.object({
        url: z.string(),
        why: z.string(),
      }),
    )
    .max(5),
});

export interface TriageParams {
  agency: AgentAgency;
  /** Latest fieldworkEnd already in polls.json for this agency, or null. */
  watermark: string | null;
  links: readonly HarvestedLink[];
  client: ModelClient;
  model: string;
}

export interface TriagedLink {
  url: string;
  why: string;
}

const SYSTEM = `You triage links from a Slovak polling agency's website.

Pick only links that plausibly lead to that agency's own release of a NEW national
parliamentary voting-preference poll ("volebné preferencie", "volebný model", "prieskum
volebných preferencií") — a PDF press release or a report page.

Rules:
- Return only URLs that appear verbatim in the list you were given. Never construct a URL.
- Exclude presidential, regional, municipal and European election polling.
- Exclude anything that is not a poll release: contact pages, about pages, services,
  methodology, general news.
- Prefer the agency's own PDF or report page over a media summary.
- Return at most 5 candidates, and an empty list when nothing qualifies. An empty list is
  the correct and expected answer most weeks.`;

/**
 * Ask the model which harvested links look like a new poll release. The result is filtered
 * back against the input list, so a hallucinated URL can never become a lead.
 */
export async function triageLinks({
  agency,
  watermark,
  links,
  client,
  model,
}: TriageParams): Promise<TriagedLink[]> {
  if (links.length === 0) return [];

  const listing = links
    .map((link, index) => `${index + 1}. ${link.url} — ${link.text}`)
    .join('\n');

  const user = [
    `Agency: ${agency}`,
    watermark != null
      ? `Latest poll already collected for this agency ended on ${watermark}. Only pick links likely to be NEWER than that.`
      : `No poll has been collected for this agency yet.`,
    '',
    'Links:',
    listing,
  ].join('\n');

  const parsed = await client.parseJson({
    model,
    system: SYSTEM,
    user,
    schema: TriageSchema,
    maxTokens: 2000,
    effort: 'low',
  });

  if (parsed == null) return [];

  const known = new Set(links.map((link) => link.url));
  return parsed.candidates.filter((candidate) => known.has(candidate.url));
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/leads/triage.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/leads/triage.ts scripts/agent/leads/triage.test.ts
git commit -m "Add model triage of harvested links"
```

---

## Task 12: Extraction

**Files:**
- Create: `scripts/agent/extract.ts`
- Test: `scripts/agent/extract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/extract.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { extractPoll } from './extract.ts';
import type { ModelClient } from './claude.ts';
import type { Extraction } from './types.ts';

const extraction: Extraction = {
  fieldworkStart: '2026-07-08',
  fieldworkEnd: '2026-07-14',
  sampleSize: 1000,
  results: [
    { party: 'Progresívne Slovensko', percent: 20.8 },
    { party: 'SMER-SSD', percent: 17.3 },
    { party: 'HLAS-SD', percent: 8.5 },
  ],
  notes: '',
};

function client(value: unknown): ModelClient {
  return { parseJson: vi.fn().mockResolvedValue(value) };
}

describe('extractPoll', () => {
  it('returns the extraction the model produced', async () => {
    const result = await extractPoll({
      docText: 'Volebné preferencie júl 2026 ...',
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: client(extraction),
      model: 'test-model',
    });
    expect(result).toEqual({ extraction });
  });

  it('errors when the model returns nothing', async () => {
    const result = await extractPoll({
      docText: 'text',
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: client(null),
      model: 'test-model',
    });
    expect(result).toEqual({ error: 'model returned no structured output' });
  });

  it('errors on fewer than three parties rather than passing it downstream', async () => {
    const result = await extractPoll({
      docText: 'text',
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: client({ ...extraction, results: extraction.results.slice(0, 2) }),
      model: 'test-model',
    });
    expect('error' in result && result.error).toMatch(/at least 3 parties/);
  });

  it('errors on a missing sample size', async () => {
    const result = await extractPoll({
      docText: 'text',
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: client({ ...extraction, sampleSize: 0 }),
      model: 'test-model',
    });
    expect('error' in result && result.error).toMatch(/sampleSize/);
  });

  it('refuses to send a document larger than the configured limit instead of truncating', async () => {
    const fake = client(extraction);
    const result = await extractPoll({
      docText: 'x'.repeat(200_001),
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: fake,
      model: 'test-model',
    });
    expect('error' in result && result.error).toMatch(/too long/);
    expect(fake.parseJson).not.toHaveBeenCalled();
  });

  it('errors when the empty-document guard trips', async () => {
    const result = await extractPoll({
      docText: '   ',
      url: 'https://ako.sk/pref.pdf',
      agency: 'AKO',
      client: client(extraction),
      model: 'test-model',
    });
    expect('error' in result && result.error).toMatch(/no text/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/extract.test.ts`
Expected: FAIL — cannot find module `./extract.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/extract.ts`:

```typescript
import { z } from 'zod';
import type { ModelClient } from './claude.ts';
import { AGENT_CONFIG, type AgentAgency } from './config.ts';
import type { Extraction } from './types.ts';

export const ExtractionSchema = z.object({
  fieldworkStart: z.string(),
  fieldworkEnd: z.string(),
  sampleSize: z.number(),
  results: z.array(
    z.object({
      party: z.string(),
      percent: z.number(),
    }),
  ),
  notes: z.string(),
});

const SYSTEM = `You transcribe a Slovak parliamentary voting-preference poll from the
polling agency's own release.

Rules:
- Copy every number exactly as printed. Never round, never re-compute, never infer a value
  that is not printed in the document.
- Copy each party label verbatim, exactly as printed — same wording, case and diacritics.
  Do not translate, expand, abbreviate or normalise it. Someone else maps labels to ids.
- The document may contain a trend table with several months of results. Use only the
  column for the poll this release is announcing — the most recent one.
- fieldworkStart and fieldworkEnd are the days respondents were surveyed, as YYYY-MM-DD.
  They are not the publication date.
- sampleSize is the number of respondents.
- Put anything ambiguous in notes: a value you could not read, two candidate tables, a
  missing date, a party label split across lines. Use an empty string when nothing was
  ambiguous. Never resolve an ambiguity by guessing — describe it instead.`;

export interface ExtractParams {
  docText: string;
  url: string;
  agency: AgentAgency;
  client: ModelClient;
  model: string;
}

export type ExtractResult = { extraction: Extraction } | { error: string };

/**
 * Read one document into a structured poll. Party labels stay verbatim: slug mapping is
 * deterministic and happens downstream, so a party rename is a data change rather than a
 * model decision.
 */
export async function extractPoll({
  docText,
  url,
  agency,
  client,
  model,
}: ExtractParams): Promise<ExtractResult> {
  if (docText.trim() === '') {
    return { error: 'document contained no text (scanned PDF or fetch returned nothing)' };
  }
  if (docText.length > AGENT_CONFIG.maxDocChars) {
    return {
      error: `document too long (${docText.length} chars, limit ${AGENT_CONFIG.maxDocChars}) — not truncating`,
    };
  }

  const parsed = await client.parseJson({
    model,
    system: SYSTEM,
    user: `Agency: ${agency}\nSource URL: ${url}\n\n--- DOCUMENT START ---\n${docText}\n--- DOCUMENT END ---`,
    schema: ExtractionSchema,
    maxTokens: 16000,
    effort: 'high',
  });

  if (parsed == null) return { error: 'model returned no structured output' };

  if (parsed.results.length < 3) {
    return { error: `extraction needs at least 3 parties (got ${parsed.results.length})` };
  }
  if (!Number.isFinite(parsed.sampleSize) || parsed.sampleSize <= 0) {
    return { error: `extraction has invalid sampleSize: ${parsed.sampleSize}` };
  }

  return { extraction: parsed };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/extract.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/extract.ts scripts/agent/extract.test.ts
git commit -m "Add model extraction of a single poll document"
```

---

## Task 13: Document fetching

**Files:**
- Create: `scripts/agent/fetchDocument.ts`
- Test: `scripts/agent/fetchDocument.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/fetchDocument.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { htmlToText, looksLikePdf } from './fetchDocument.ts';

describe('htmlToText', () => {
  it('extracts visible text', () => {
    const text = htmlToText('<html><body><h1>Preferencie</h1><p>PS 20,8 %</p></body></html>');
    expect(text).toContain('Preferencie');
    expect(text).toContain('PS 20,8 %');
  });

  it('drops script and style content', () => {
    const text = htmlToText(
      '<body><script>var x = "SMER 99 %";</script><style>.a{color:red}</style><p>SMER 17,3 %</p></body>',
    );
    expect(text).not.toContain('99');
    expect(text).not.toContain('color:red');
    expect(text).toContain('SMER 17,3 %');
  });

  it('collapses runs of whitespace but keeps line structure', () => {
    const text = htmlToText('<body><p>PS   20,8</p>\n\n\n<p>SMER   17,3</p></body>');
    expect(text).toMatch(/PS 20,8/);
    expect(text).not.toMatch(/\n\s*\n\s*\n/);
  });
});

describe('looksLikePdf', () => {
  it('detects a pdf by content type', () => {
    expect(looksLikePdf('https://ako.sk/x', 'application/pdf')).toBe(true);
  });

  it('detects a pdf by path even with a query string', () => {
    expect(looksLikePdf('https://ako.sk/x/pref.pdf?v=2', 'application/octet-stream')).toBe(true);
  });

  it('treats html as html', () => {
    expect(looksLikePdf('https://ako.sk/report/', 'text/html; charset=utf-8')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/fetchDocument.test.ts`
Expected: FAIL — cannot find module `./fetchDocument.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/fetchDocument.ts`:

```typescript
import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';
import { fetchWithDelay } from '../ingestion/fetch/shared.ts';

export interface FetchedDoc {
  url: string;
  kind: 'html' | 'pdf';
  text: string;
}

/** Visible page text, with the parts that never contain poll numbers removed. */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, nav, header, footer').remove();
  return $('body')
    .text()
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function looksLikePdf(url: string, contentType: string): boolean {
  if (contentType.toLowerCase().includes('pdf')) return true;
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.pdf');
  } catch {
    return false;
  }
}

/**
 * Fetch a lead URL as plain text. Rate limiting and User-Agent come from the existing
 * ingestion fetch helper, so the agent is no more aggressive than the current pipeline.
 */
export async function fetchDocument(url: string): Promise<FetchedDoc> {
  const response = await fetchWithDelay(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);

  const contentType = response.headers.get('content-type') ?? '';

  if (looksLikePdf(url, contentType)) {
    const buffer = await response.arrayBuffer();
    const parser = new PDFParse({ data: Buffer.from(buffer) });
    try {
      const result = await parser.getText();
      return { url, kind: 'pdf', text: result.text ?? '' };
    } finally {
      await parser.destroy();
    }
  }

  return { url, kind: 'html', text: htmlToText(await response.text()) };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/fetchDocument.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/fetchDocument.ts scripts/agent/fetchDocument.test.ts
git commit -m "Fetch lead documents as text (HTML or PDF)"
```

---

## Task 13b: Follow a report page to its linked PDF/CSV

Discovered during Task 13's review: the existing deterministic pipeline's Focus fetcher
(`scripts/ingestion/fetchers/focus.ts`) does a **two-hop** fetch — list page → report page
→ PDF or CSV — because a Focus report page frequently has no data table of its own; the
real numbers are only in a linked "Tlačová správa" PDF or a "Stiahnuť údaje" CSV. Confirmed
against the live site during review: recent Focus report pages contain zero `<table>`
elements and the poll percentages only appear in the linked PDF.

`scripts/agent/leads/links.ts` (Task 9) and `scripts/agent/leads/triage.ts` (Task 11) are
single-hop by design — the triaged lead URL is fetched directly. Without this task, a
triaged Focus lead would almost always be a report page with no extractable numbers, and
`extractPoll` would report "no text" or an ambiguous document every week — a silent,
agency-specific failure that would be easy to miss for a while, since the AKO and Ipsos
paths (confirmed single-hop: their list pages link PDFs directly) would keep working fine.

This task adds one hop, decided by structure rather than by hardcoding Focus's page markup:
if a fetched HTML lead has no `<table>` and links to exactly one PDF or CSV, follow it. An
ambiguous page (no such link, or more than one) is used as-is — consistent with this
project's "report rather than guess" design — rather than guessing which link is the real
release.

**Files:**
- Create: `scripts/agent/resolveDocument.ts`
- Test: `scripts/agent/resolveDocument.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/resolveDocument.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { decideReportPageAction } from './resolveDocument.ts';

describe('decideReportPageAction', () => {
  it('uses the page as-is when it already has a table', () => {
    const html = '<body><table><tr><td>PS</td><td>20,8</td></tr></table></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'use-as-is',
    });
  });

  it('follows a single PDF link when the page has no table', () => {
    const html = '<body><a href="/tlacova-sprava.pdf">Tlačová správa</a></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'follow',
      url: 'https://example.sk/tlacova-sprava.pdf',
    });
  });

  it('follows a single CSV link when the page has no table', () => {
    const html = '<body><a href="/data.csv">Stiahnuť údaje</a></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'follow',
      url: 'https://example.sk/data.csv',
    });
  });

  it('uses the page as-is when there is no table and no PDF/CSV link', () => {
    const html = '<body><p>No data here.</p></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'use-as-is',
    });
  });

  it('uses the page as-is when multiple PDF/CSV links make the choice ambiguous', () => {
    const html = '<body><a href="/a.pdf">A</a><a href="/b.pdf">B</a></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'use-as-is',
    });
  });

  it('treats even an empty table as having its own data structure, never overriding it', () => {
    const html = '<body><table></table><a href="/x.pdf">X</a></body>';
    expect(decideReportPageAction(html, 'https://example.sk/report/')).toEqual({
      action: 'use-as-is',
    });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/resolveDocument.test.ts`
Expected: FAIL — cannot find module `./resolveDocument.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/resolveDocument.ts`:

```typescript
import * as cheerio from 'cheerio';
import { fetchText } from '../ingestion/fetch/shared.ts';
import { fetchDocument, type FetchedDoc } from './fetchDocument.ts';
import { harvestLinks } from './leads/links.ts';

export type ReportPageDecision =
  | { action: 'use-as-is' }
  | { action: 'follow'; url: string };

/**
 * Decide whether a fetched HTML report page already contains its own poll data (a table)
 * or should be followed to a linked PDF/CSV release instead. Mirrors what the existing
 * deterministic Focus fetcher does (scripts/ingestion/fetchers/focus.ts): follow only when
 * there is no table AND exactly one PDF/CSV link. An ambiguous page (none, or more than
 * one) is used as-is rather than guessed at — extraction will then report it found no
 * usable data, which surfaces in the PR rather than silently picking the wrong link.
 */
export function decideReportPageAction(html: string, baseUrl: string): ReportPageDecision {
  const $ = cheerio.load(html);
  if ($('table').length > 0) return { action: 'use-as-is' };

  const candidates = harvestLinks(html, baseUrl).filter((link) =>
    /\.(pdf|csv)(\?|$)/i.test(link.url),
  );
  if (candidates.length !== 1) return { action: 'use-as-is' };

  return { action: 'follow', url: candidates[0]!.url };
}

/**
 * Fetch a lead URL, following one hop to a linked PDF/CSV when the page itself has no
 * table. Falls back to the originally fetched document on any error along the way — a
 * lead is never lost just because the follow-up hop failed.
 */
export async function resolveLeadDocument(url: string): Promise<FetchedDoc> {
  const initial = await fetchDocument(url);
  if (initial.kind !== 'html') return initial;

  let html: string;
  try {
    html = await fetchText(url);
  } catch {
    return initial;
  }

  const decision = decideReportPageAction(html, url);
  if (decision.action === 'use-as-is') return initial;

  try {
    return await fetchDocument(decision.url);
  } catch {
    return initial;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/resolveDocument.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Live-check against the real Focus report page**

```bash
npx tsx -e "
import { decideReportPageAction } from './scripts/agent/resolveDocument.ts';
import { fetchText } from './scripts/ingestion/fetch/shared.ts';
const html = await fetchText('https://www.focus-research.sk/archiv/volebne-preferencie-politickych-stran-jun-2026/');
console.log(decideReportPageAction(html, 'https://www.focus-research.sk/'));
"
```

(Adjust the URL to whatever the current latest Focus report page actually is — check
`https://www.focus-research.sk/press-centrum/` for the real slug if the one above 404s.)

Expected: `{ action: 'follow', url: '...pdf' }` (or a CSV URL). If it prints
`{ action: 'use-as-is' }`, read the fetched HTML and check whether the page actually has a
table (in which case `use-as-is` is correct) or whether the PDF/CSV link uses a pattern
`decideReportPageAction`'s regex doesn't catch — widen the regex if so, and add a
regression test using a small inline excerpt of the real link markup.

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/resolveDocument.ts scripts/agent/resolveDocument.test.ts
git commit -m "Follow a report page to its linked PDF/CSV when it has no table"
```

**Note for Task 18:** `run.ts`'s `processLead` must call `resolveLeadDocument(lead.url)`,
not `fetchDocument(lead.url)` directly — the orchestration code below has been written
with this already in mind.

---

## Task 14: Poll id assignment

Ids must be stable. `src/features/coalitions/coalitionStorage.ts` persists a `pollId` in the visitor's localStorage, so renaming an existing poll's id silently breaks a saved coalition. This assigner therefore only ever names *new* polls and treats every existing id as taken.

**Files:**
- Create: `scripts/agent/ids.ts`
- Test: `scripts/agent/ids.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/ids.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assignPollId } from './ids.ts';

describe('assignPollId', () => {
  it('uses agency and month when the month is free', () => {
    const id = assignPollId({ agency: 'AKO', fieldworkStart: '2026-08-03' }, new Set());
    expect(id).toBe('sk-ako-2026-08');
  });

  it('appends the start day when the month id is taken', () => {
    const id = assignPollId(
      { agency: 'AKO', fieldworkStart: '2026-08-03' },
      new Set(['sk-ako-2026-08']),
    );
    expect(id).toBe('sk-ako-2026-08-03');
  });

  it('adds a counter when the day id is also taken', () => {
    const id = assignPollId(
      { agency: 'AKO', fieldworkStart: '2026-08-03' },
      new Set(['sk-ako-2026-08', 'sk-ako-2026-08-03']),
    );
    expect(id).toBe('sk-ako-2026-08-03-2');
  });

  it('lowercases the agency', () => {
    const id = assignPollId({ agency: 'Focus', fieldworkStart: '2026-08-03' }, new Set());
    expect(id).toBe('sk-focus-2026-08');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/ids.test.ts`
Expected: FAIL — cannot find module `./ids.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/ids.ts`:

```typescript
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
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/ids.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/ids.ts scripts/agent/ids.test.ts
git commit -m "Assign ids to new polls without renaming existing ones"
```

---

## Task 15: Merge

Added during Task 14's review: `assignPollId` trusts its caller to keep `takenIds`
accurate, and nothing in the codebase asserts id uniqueness on the final array before it's
written to disk. Given a duplicate id can silently corrupt or misattribute a real visitor's
saved coalition (`src/features/coalitions/coalitionStorage.ts` looks up a poll by id from
localStorage), `mergePolls` adds one cheap safety net: a final invariant check that throws
rather than writing a `polls.json` with a duplicate id, independent of whether the
`takenIds` bookkeeping above it was done correctly. This is Step 3b below.

**Files:**
- Create: `scripts/agent/merge.ts`
- Test: `scripts/agent/merge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/merge.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mergePolls } from './merge.ts';
import type { NormalizedPoll } from '../ingestion/types.ts';

function poll(overrides: Partial<NormalizedPoll>): NormalizedPoll {
  return {
    id: '',
    countryId: 'sk',
    electionId: 'sk-2024',
    agency: 'AKO',
    fieldworkStart: '2026-08-03',
    fieldworkEnd: '2026-08-09',
    sampleSize: 1000,
    sourceUrl: 'https://ako.sk/aug.pdf',
    results: { ps: 20, smer: 17, hlas: 9 },
    ...overrides,
  };
}

const existing: NormalizedPoll[] = [
  poll({ id: 'sk-ako-2026-07', fieldworkStart: '2026-07-08', fieldworkEnd: '2026-07-14' }),
  poll({
    id: 'sk-focus-2026-06',
    agency: 'Focus',
    fieldworkStart: '2026-06-22',
    fieldworkEnd: '2026-06-29',
  }),
];

describe('mergePolls', () => {
  it('adds a new poll and gives it an id', () => {
    const result = mergePolls(existing, [poll({})], {});
    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.id).toBe('sk-ako-2026-08');
    expect(result.polls).toHaveLength(3);
  });

  it('never changes the id of an existing poll', () => {
    const result = mergePolls(existing, [poll({})], {});
    const ids = result.polls.map((p) => p.id);
    expect(ids).toContain('sk-ako-2026-07');
    expect(ids).toContain('sk-focus-2026-06');
  });

  it('rejects a poll that duplicates an existing agency and fieldwork window', () => {
    const duplicate = poll({ fieldworkStart: '2026-07-08', fieldworkEnd: '2026-07-14' });
    const result = mergePolls(existing, [duplicate], {});
    expect(result.added).toEqual([]);
    expect(result.rejected[0]!.reason).toMatch(/already in polls.json/);
  });

  it('rejects a second copy of the same poll within one run', () => {
    const result = mergePolls(existing, [poll({}), poll({})], {});
    expect(result.added).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  it('refuses to touch the verified window', () => {
    const old = poll({ fieldworkStart: '2025-01-06', fieldworkEnd: '2025-01-10' });
    const result = mergePolls(existing, [old], { processedDataUntil: '2026-01-25' });
    expect(result.added).toEqual([]);
    expect(result.rejected[0]!.reason).toMatch(/verified/);
  });

  it('keeps the array sorted by fieldworkStart', () => {
    const older = poll({ fieldworkStart: '2026-07-20', fieldworkEnd: '2026-07-25' });
    const result = mergePolls(existing, [poll({}), older], {});
    const starts = result.polls.map((p) => p.fieldworkStart);
    expect(starts).toEqual([...starts].sort());
  });

  it('gives a second poll in the same month a day-suffixed id', () => {
    const first = poll({ fieldworkStart: '2026-08-03', fieldworkEnd: '2026-08-09' });
    const second = poll({ fieldworkStart: '2026-08-20', fieldworkEnd: '2026-08-25' });
    const result = mergePolls(existing, [first, second], {});
    expect(result.added.map((p) => p.id)).toEqual(['sk-ako-2026-08', 'sk-ako-2026-08-20']);
  });

  it('throws rather than write a duplicate id, even if id assignment is ever wrong', () => {
    // Simulates the exact failure mode assignPollId's caller contract depends on: two
    // incoming polls that would end up with the same id. mergePolls's own bookkeeping
    // prevents this in practice (see the "same month" test above) — this test pins the
    // safety net that exists independently of that bookkeeping ever staying correct.
    const corrupted: NormalizedPoll[] = [
      ...existing,
      poll({ id: 'sk-ako-2026-07', fieldworkStart: '2026-08-01', fieldworkEnd: '2026-08-05' }),
    ];
    expect(() => mergePolls(corrupted, [], {})).toThrow(/duplicate id/i);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/merge.test.ts`
Expected: FAIL — cannot find module `./merge.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/merge.ts`:

```typescript
import type { NormalizedPoll } from '../ingestion/types.ts';
import { assignPollId } from './ids.ts';

export interface MergeOptions {
  /** Polls ending on or before this date are hand-verified and must never be rewritten. */
  processedDataUntil?: string;
}

export interface MergeResult {
  polls: NormalizedPoll[];
  added: NormalizedPoll[];
  rejected: { poll: NormalizedPoll; reason: string }[];
}

function dedupKey(poll: NormalizedPoll): string {
  return `${poll.agency}|${poll.fieldworkStart}|${poll.fieldworkEnd}`;
}

/**
 * Merge newly extracted polls into the existing array. Existing polls are never modified
 * — the agent only appends. Anything it declines to add is returned with a reason so the
 * PR can say so out loud.
 */
export function mergePolls(
  existing: readonly NormalizedPoll[],
  incoming: readonly NormalizedPoll[],
  options: MergeOptions = {},
): MergeResult {
  const takenIds = new Set(existing.map((p) => p.id));
  const seenKeys = new Set(existing.map(dedupKey));

  const added: NormalizedPoll[] = [];
  const rejected: { poll: NormalizedPoll; reason: string }[] = [];

  for (const poll of incoming) {
    if (
      options.processedDataUntil != null &&
      poll.fieldworkEnd <= options.processedDataUntil
    ) {
      rejected.push({
        poll,
        reason: `fieldwork ends ${poll.fieldworkEnd}, inside the verified window (<= ${options.processedDataUntil})`,
      });
      continue;
    }

    const key = dedupKey(poll);
    if (seenKeys.has(key)) {
      rejected.push({ poll, reason: `already in polls.json or earlier in this run (${key})` });
      continue;
    }

    const id = assignPollId(poll, takenIds);
    takenIds.add(id);
    seenKeys.add(key);
    added.push({ ...poll, id });
  }

  const polls = [...existing, ...added].sort((a, b) =>
    a.fieldworkStart.localeCompare(b.fieldworkStart),
  );

  // Safety net, independent of the takenIds/seenKeys bookkeeping above: never write a
  // polls.json with a duplicate id. A duplicate id is looked up by
  // coalitionStorage.ts from a visitor's localStorage — writing one out would silently
  // corrupt or misattribute a real saved coalition, so this fails loudly instead.
  const idCounts = new Map<string, number>();
  for (const p of polls) idCounts.set(p.id, (idCounts.get(p.id) ?? 0) + 1);
  const duplicateId = [...idCounts.entries()].find(([, count]) => count > 1)?.[0];
  if (duplicateId != null) {
    throw new Error(`mergePolls produced a duplicate id: ${duplicateId}`);
  }

  return { polls, added, rejected };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/merge.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/merge.ts scripts/agent/merge.test.ts
git commit -m "Merge new polls without touching existing ones"
```

---

## Task 16: Seat projection for a new poll

Every poll in `polls.json` carries `metadata.seatProjection`. `scripts/addSeatProjections.ts` recomputes the whole file; the agent needs the same calculation for one poll.

**Files:**
- Create: `scripts/agent/seats.ts`
- Test: `scripts/agent/seats.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/agent/seats.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { withSeatProjection } from './seats.ts';
import type { NormalizedPoll } from '../ingestion/types.ts';

const rules = { totalSeats: 150, thresholdPercent: 5 };

const poll: NormalizedPoll = {
  id: 'sk-ako-2026-08',
  countryId: 'sk',
  electionId: 'sk-2024',
  agency: 'AKO',
  fieldworkStart: '2026-08-03',
  fieldworkEnd: '2026-08-09',
  sampleSize: 1000,
  sourceUrl: 'https://ako.sk/aug.pdf',
  results: { ps: 21, smer: 17, hlas: 9, sns: 4, mala: 0.3 },
};

describe('withSeatProjection', () => {
  it('allocates every seat', () => {
    const result = withSeatProjection(poll, rules);
    const total = Object.values(result.metadata!.seatProjection!).reduce((a, b) => a + b, 0);
    expect(total).toBe(150);
  });

  it('gives parties below the threshold no seats', () => {
    const result = withSeatProjection(poll, rules);
    expect(result.metadata!.seatProjection!.sns).toBe(0);
    expect(result.metadata!.seatProjection!.mala).toBe(0);
  });

  it('gives the largest party the most seats', () => {
    const projection = withSeatProjection(poll, rules).metadata!.seatProjection!;
    expect(projection.ps).toBeGreaterThan(projection.smer!);
  });

  it('preserves other metadata', () => {
    const result = withSeatProjection({ ...poll, metadata: { turnout: 61.2 } }, rules);
    expect(result.metadata!.turnout).toBe(61.2);
  });

  it('does not mutate the input poll', () => {
    withSeatProjection(poll, rules);
    expect(poll.metadata).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run scripts/agent/seats.test.ts`
Expected: FAIL — cannot find module `./seats.ts`.

- [ ] **Step 3: Implement**

Create `scripts/agent/seats.ts`:

```typescript
import { allocateSeats } from '../../src/core/allocation/index.ts';
import type { NormalizedPoll } from '../ingestion/types.ts';

export interface ElectionRules {
  totalSeats: number;
  thresholdPercent: number;
}

/**
 * Add metadata.seatProjection using the same Hagenbach-Bischoff allocation the app uses
 * (zákon č. 180/2014 Z. z., §68). Returns a new poll; the input is not mutated.
 */
export function withSeatProjection(
  poll: NormalizedPoll,
  rules: ElectionRules,
): NormalizedPoll {
  const seatProjection = allocateSeats(
    poll.results,
    rules.totalSeats,
    rules.thresholdPercent,
    { asPercentages: true },
  );

  return {
    ...poll,
    metadata: { ...(poll.metadata ?? {}), seatProjection },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run scripts/agent/seats.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent/seats.ts scripts/agent/seats.test.ts
git commit -m "Add seat projection for a newly ingested poll"
```

---

## Task 17: Report and PR body

The PR body is the handoff to the follow-up session, and it is rendered by this code — never written by the model.

**Files:**
- Create: `scripts/agent/report.ts`
- Modify: `scripts/agent/types.ts`
- Test: `scripts/agent/report.test.ts`

- [ ] **Step 1: Add the aggregator-gap field to the report type**

In `scripts/agent/types.ts`, add to `AgentRunReport`, after `leads`:

```typescript
  /**
   * Polls the aggregator lists for a watched agency, newer than the watermark, that no
   * agency-site lead matched. The agent does not chase these — it reports them so a human
   * can add the poll by hand.
   */
  aggregatorGaps: AggregatorRow[];
```

- [ ] **Step 2: Write the failing test**

Create `scripts/agent/report.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderPrBody } from './report.ts';
import type { AgentRunReport } from './types.ts';

const base: AgentRunReport = {
  runDate: '2026-08-31',
  watermarks: { AKO: '2026-07-14', Focus: '2026-06-29', Ipsos: '2026-06-23' },
  leadCount: 1,
  leads: [],
  aggregatorGaps: [],
  addedPolls: [],
};

const cleanLead = {
  agency: 'AKO' as const,
  url: 'https://ako.sk/aug.pdf',
  discoveredBy: 'site' as const,
  label: 'Volebné preferencie august 2026',
  outcome: 'added' as const,
  reason: '',
  extraction: {
    fieldworkStart: '2026-08-03',
    fieldworkEnd: '2026-08-09',
    sampleSize: 1000,
    results: [{ party: 'PS', percent: 20.8 }],
    notes: '',
  },
  unmapped: [],
  grounding: [{ party: 'PS', value: 20.8, grounded: true, reason: '' }],
  mismatches: [],
  pollId: 'sk-ako-2026-08',
};

describe('renderPrBody', () => {
  it('lists the added poll with its agency, dates and sample size', () => {
    const body = renderPrBody({ ...base, leads: [cleanLead] });
    expect(body).toContain('sk-ako-2026-08');
    expect(body).toContain('2026-08-03');
    expect(body).toContain('1000');
  });

  it('tags the maintainer', () => {
    expect(renderPrBody(base)).toContain('@peterjurco');
  });

  it('says explicitly when nothing needs attention', () => {
    const body = renderPrBody({ ...base, leads: [cleanLead] });
    expect(body).toMatch(/nothing needs your attention/i);
  });

  it('reports an unmapped party with its value', () => {
    const body = renderPrBody({
      ...base,
      leads: [{ ...cleanLead, unmapped: [{ party: 'Strana vidieka', percent: 0.3 }] }],
    });
    expect(body).toContain('Strana vidieka');
    expect(body).toContain('0.3');
    expect(body).toMatch(/not in parties\.json/i);
  });

  it('reports a grounding failure', () => {
    const body = renderPrBody({
      ...base,
      leads: [
        {
          ...cleanLead,
          grounding: [
            { party: 'SMER-SSD', value: 17.8, grounded: false, reason: 'value 17.8 not found near "SMER-SSD"' },
          ],
        },
      ],
    });
    expect(body).toMatch(/could not be found in the source/i);
    expect(body).toContain('SMER-SSD');
  });

  it('reports a cross-check mismatch', () => {
    const body = renderPrBody({
      ...base,
      leads: [
        {
          ...cleanLead,
          mismatches: [{ field: 'results.smer', extracted: 17.8, aggregator: 17.3 }],
        },
      ],
    });
    expect(body).toContain('results.smer');
    expect(body).toContain('17.3');
  });

  it('reports a failed lead', () => {
    const body = renderPrBody({
      ...base,
      leads: [{ ...cleanLead, outcome: 'failed', reason: 'HTTP 404', extraction: null, pollId: null }],
    });
    expect(body).toContain('HTTP 404');
  });

  it('reports an aggregator gap', () => {
    const body = renderPrBody({
      ...base,
      aggregatorGaps: [
        {
          agency: 'Ipsos',
          fieldworkStart: '2026-08-10',
          fieldworkEnd: '2026-08-15',
          sampleSize: 1000,
          results: { ps: 21 },
        },
      ],
    });
    expect(body).toMatch(/no primary source/i);
    expect(body).toContain('Ipsos');
  });

  it('includes the model notes when the model flagged something', () => {
    const body = renderPrBody({
      ...base,
      leads: [
        {
          ...cleanLead,
          extraction: { ...cleanLead.extraction, notes: 'Two tables present; used the July column.' },
        },
      ],
    });
    expect(body).toContain('Two tables present');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run scripts/agent/report.test.ts`
Expected: FAIL — cannot find module `./report.ts`.

- [ ] **Step 4: Implement**

Create `scripts/agent/report.ts`:

```typescript
import type { AgentRunReport, LeadReport } from './types.ts';

const MAINTAINER = '@peterjurco';

function addedSection(leads: readonly LeadReport[]): string[] {
  const added = leads.filter((lead) => lead.outcome === 'added');
  if (added.length === 0) return ['## Added', '', 'No polls added.'];

  const lines = ['## Added', ''];
  for (const lead of added) {
    const e = lead.extraction;
    lines.push(
      `- **${lead.pollId ?? '(no id)'}** — ${lead.agency}, fieldwork ${e?.fieldworkStart} to ${e?.fieldworkEnd}, n=${e?.sampleSize}`,
      `  - source: ${lead.url}`,
      `  - found via: ${lead.discoveredBy}`,
    );
  }
  return lines;
}

function attentionSection(report: AgentRunReport): string[] {
  const lines: string[] = ['## Needs your attention', ''];
  let any = false;

  for (const lead of report.leads) {
    const items: string[] = [];

    for (const party of lead.unmapped) {
      items.push(
        `- \`${party.party}\` at ${party.percent}% is not in parties.json — the poll was ingested without it.`,
      );
    }

    for (const check of lead.grounding.filter((g) => !g.grounded)) {
      items.push(
        `- \`${check.party}\` = ${check.value} could not be found in the source text (${check.reason}). Verify against the PDF before merging.`,
      );
    }

    for (const mismatch of lead.mismatches) {
      items.push(
        `- \`${mismatch.field}\`: extracted \`${mismatch.extracted ?? 'missing'}\`, aggregator says \`${mismatch.aggregator ?? 'missing'}\`.`,
      );
    }

    if (lead.extraction?.notes != null && lead.extraction.notes.trim() !== '') {
      items.push(`- model notes: ${lead.extraction.notes}`);
    }

    if (lead.outcome !== 'added') {
      items.push(`- ${lead.outcome}: ${lead.reason}`);
    }

    if (items.length > 0) {
      any = true;
      lines.push(`### ${lead.agency} — ${lead.url}`, '', ...items, '');
    }
  }

  for (const gap of report.aggregatorGaps) {
    any = true;
    lines.push(
      `### ${gap.agency} — no primary source found`,
      '',
      `- The aggregator lists a ${gap.agency} poll with fieldwork ${gap.fieldworkStart} to ${gap.fieldworkEnd}, but no matching release was found on the agency's site. Add it by hand if it is real.`,
      '',
    );
  }

  if (!any) lines.push('Nothing needs your attention — every value was found in its source and matched the cross-check.');

  return lines;
}

/** The PR body. Deterministic: rendered from the report, never written by the model. */
export function renderPrBody(report: AgentRunReport): string {
  const watermarks = Object.entries(report.watermarks)
    .map(([agency, date]) => `${agency} ${date ?? 'none'}`)
    .join(', ');

  return [
    `Automated poll watch run of ${report.runDate}.`,
    '',
    `Watermarks at start: ${watermarks}. Leads examined: ${report.leadCount}.`,
    '',
    ...addedSection(report.leads),
    '',
    ...attentionSection(report),
    '',
    '---',
    '',
    `${MAINTAINER} please review before merging. Values were extracted by a model and checked against the source text; the full run report is committed alongside this change under \`scripts/agent/logs/\`.`,
  ].join('\n');
}

/** Commit subject line for the branch. */
export function renderCommitMessage(report: AgentRunReport): string {
  const added = report.leads.filter((lead) => lead.outcome === 'added');
  if (added.length === 0) return `Poll watch ${report.runDate}: no new polls`;
  const summary = added
    .map((lead) => `${lead.agency} ${lead.extraction?.fieldworkEnd?.slice(0, 7) ?? ''}`)
    .join(', ');
  return `Add ${added.length} poll(s) from poll watch: ${summary}`;
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run scripts/agent/report.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/report.ts scripts/agent/report.test.ts scripts/agent/types.ts
git commit -m "Render the poll watch run report and PR body"
```

---

## Task 18: Orchestration

`run.ts` wires the tested modules together and owns all I/O. It contains no poll logic of its own — if you find yourself writing a rule here, it belongs in a tested module.

**Files:**
- Create: `scripts/agent/run.ts`

- [ ] **Step 1: Write the orchestrator**

Create `scripts/agent/run.ts`:

```typescript
/**
 * Poll watch agent: find polls newer than each agency's watermark, extract them, verify
 * them against their source, and write the result plus a full report. Writes files only —
 * branching, committing and opening the PR is the workflow's job.
 *
 *   npm run ingest:agent
 *   npm run ingest:agent -- --dry-run
 *   npm run ingest:agent -- --agency=AKO --since=2026-05-01 --verbose
 */
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIPELINE_CONFIG } from '../ingestion/config.ts';
import { fetchText, shortFetchError } from '../ingestion/fetch/shared.ts';
import { mapResultsToSlugs, normalizePoll } from '../ingestion/normalize/index.ts';
import type { NormalizedPoll, RawPoll } from '../ingestion/types.ts';
import { validatePoll } from '../ingestion/validate/index.ts';
import { createModelClient, type ModelClient } from './claude.ts';
import { AGENT_AGENCIES, AGENT_CONFIG, type AgentAgency } from './config.ts';
import { crossCheck } from './crosscheck.ts';
import { extractPoll } from './extract.ts';
import { resolveLeadDocument } from './resolveDocument.ts';
import { checkGrounding } from './grounding.ts';
import { parseAggregatorRows } from './leads/aggregatorTable.ts';
import { harvestLinks } from './leads/links.ts';
import { triageLinks } from './leads/triage.ts';
import { mergePolls } from './merge.ts';
import { renderCommitMessage, renderPrBody } from './report.ts';
import { withSeatProjection, type ElectionRules } from './seats.ts';
import type { AggregatorRow, AgentRunReport, Lead, LeadReport } from './types.ts';
import { computeWatermarks } from './watermarks.ts';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const POLLS_PATH = join(REPO_ROOT, 'public/data/sk/polls.json');
const ELECTION_PATH = join(REPO_ROOT, 'public/data/sk/election.json');
const LOG_DIR = join(REPO_ROOT, 'scripts/agent/logs');

function flagValue(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg == null ? null : arg.slice(name.length + 3).trim() || null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const DRY_RUN = hasFlag('dry-run');
const VERBOSE = hasFlag('verbose');

function log(message: string): void {
  console.log(message);
}

function debug(message: string): void {
  if (VERBOSE) console.log(`  ${message}`);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Write via a temp file so a crash mid-run can never leave a half-written polls.json. */
async function writeAtomic(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, contents, 'utf-8');
  await rename(tmp, path);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T;
}

/** Agency list pages → harvested links → model triage → leads. */
async function findSiteLeads(
  agency: AgentAgency,
  watermark: string | null,
  client: ModelClient,
): Promise<Lead[]> {
  const leads: Lead[] = [];

  for (const listUrl of AGENT_CONFIG.listUrls[agency]) {
    let html: string;
    try {
      html = await fetchText(listUrl);
    } catch (error) {
      log(`  ${agency}: could not fetch ${listUrl} — ${shortFetchError(error)}`);
      continue;
    }

    const links = harvestLinks(html, listUrl);
    debug(`${agency}: ${links.length} links on ${listUrl}`);

    let triaged;
    try {
      triaged = await triageLinks({
        agency,
        watermark,
        links,
        client,
        model: AGENT_CONFIG.models.triage,
      });
    } catch (error) {
      log(`  ${agency}: triage failed for ${listUrl} — ${shortFetchError(error)}`);
      continue;
    }

    for (const candidate of triaged) {
      leads.push({
        agency,
        url: candidate.url,
        discoveredBy: 'site',
        label: candidate.why,
      });
    }
  }

  return leads;
}

/** Aggregator rows newer than their agency's watermark. Scoped to the (possibly
 * --agency-filtered) agencies actually being watched this run, so a filtered run's
 * report doesn't list every historical row for an out-of-scope agency as a "gap". */
async function findAggregatorRows(
  watermarks: Record<string, string | null>,
  agencies: readonly AgentAgency[],
): Promise<AggregatorRow[]> {
  let html: string;
  try {
    html = await fetchText(AGENT_CONFIG.aggregatorUrl);
  } catch (error) {
    log(`  aggregator: could not fetch — ${shortFetchError(error)}`);
    return [];
  }

  const { rows, skipped } = parseAggregatorRows(html, agencies);
  if (skipped.length > 0) debug(`aggregator: ${skipped.length} unparseable rows`);

  return rows.filter((row) => {
    const watermark = watermarks[row.agency];
    return watermark == null || row.fieldworkEnd > watermark;
  });
}

/** Fetch, extract, ground, normalize, validate and cross-check one lead. */
async function processLead(
  lead: Lead,
  watermark: string | null,
  aggregatorRows: readonly AggregatorRow[],
  client: ModelClient,
): Promise<{ report: LeadReport; poll: NormalizedPoll | null }> {
  const report: LeadReport = {
    agency: lead.agency,
    url: lead.url,
    discoveredBy: lead.discoveredBy,
    label: lead.label,
    outcome: 'failed',
    reason: '',
    extraction: null,
    unmapped: [],
    grounding: [],
    mismatches: [],
    pollId: null,
  };

  let document;
  try {
    document = await resolveLeadDocument(lead.url);
  } catch (error) {
    report.reason = shortFetchError(error);
    return { report, poll: null };
  }

  let extracted;
  try {
    extracted = await extractPoll({
      docText: document.text,
      url: lead.url,
      agency: lead.agency,
      client,
      model: AGENT_CONFIG.models.extraction,
    });
  } catch (error) {
    report.reason = `extraction failed: ${shortFetchError(error)}`;
    return { report, poll: null };
  }

  if ('error' in extracted) {
    report.reason = extracted.error;
    return { report, poll: null };
  }

  const { extraction } = extracted;
  report.extraction = extraction;
  report.grounding = checkGrounding(document.text, extraction.results);

  const rawResults: Record<string, number> = {};
  for (const result of extraction.results) rawResults[result.party] = result.percent;

  const { unmapped } = mapResultsToSlugs(rawResults);
  report.unmapped = extraction.results.filter((r) => unmapped.includes(r.party));

  const raw: RawPoll = {
    agency: lead.agency,
    fieldworkStart: extraction.fieldworkStart,
    fieldworkEnd: extraction.fieldworkEnd,
    sampleSize: extraction.sampleSize,
    sourceUrl: lead.url,
    results: rawResults,
  };

  const normalized = normalizePoll(raw, PIPELINE_CONFIG.countryId, PIPELINE_CONFIG.electionId);
  if ('skip' in normalized) {
    report.outcome = 'skipped';
    report.reason = normalized.skip.reason;
    return { report, poll: null };
  }

  const poll = normalized.poll;

  const invalid = validatePoll(poll, {
    fieldworkStartMin: PIPELINE_CONFIG.fieldworkStartMin,
    fieldworkEndMax: PIPELINE_CONFIG.fieldworkEndMax,
  });
  if (invalid != null) {
    report.outcome = 'skipped';
    report.reason = invalid.reason;
    return { report, poll: null };
  }

  if (watermark != null && poll.fieldworkEnd <= watermark) {
    report.outcome = 'skipped';
    report.reason = `not newer than the watermark (${poll.fieldworkEnd} <= ${watermark})`;
    return { report, poll: null };
  }

  const match = aggregatorRows.find(
    (row) =>
      row.agency === lead.agency &&
      row.fieldworkEnd.slice(0, 7) === poll.fieldworkEnd.slice(0, 7),
  );
  if (match != null) report.mismatches = crossCheck(poll, match);

  report.outcome = 'added';
  return { report, poll };
}

async function main(): Promise<void> {
  const agencyFilter = flagValue('agency');
  const sinceOverride = flagValue('since');

  const agencies = (
    agencyFilter == null
      ? [...AGENT_AGENCIES]
      : AGENT_AGENCIES.filter((a) => a.toLowerCase() === agencyFilter.toLowerCase())
  ) as AgentAgency[];

  if (agencies.length === 0) {
    throw new Error(`Unknown agency "${agencyFilter}". Known: ${AGENT_AGENCIES.join(', ')}`);
  }

  const existingPolls = await readJson<NormalizedPoll[]>(POLLS_PATH);
  const rules = await readJson<ElectionRules>(ELECTION_PATH);

  const watermarks = computeWatermarks(existingPolls, agencies);
  if (sinceOverride != null) {
    for (const agency of agencies) watermarks[agency] = sinceOverride;
  }
  log(
    `Watermarks: ${Object.entries(watermarks)
      .map(([a, d]) => `${a}=${d ?? 'none'}`)
      .join(' ')}`,
  );

  const client = createModelClient();

  log('Finding leads...');
  const siteLeads: Lead[] = [];
  for (const agency of agencies) {
    siteLeads.push(...(await findSiteLeads(agency, watermarks[agency] ?? null, client)));
  }

  const aggregatorRows = await findAggregatorRows(watermarks, agencies);

  // Leads are not deduped upstream: findSiteLeads runs triage independently per list
  // page, so the same release (e.g. linked from both an agency's homepage and its press
  // page) can surface as two Lead entries with an identical url. The report-attribution
  // lookups below (merged.rejected and merged.added, both keyed by r.url ===
  // poll.sourceUrl) assume url is unique per lead — a duplicate would make Array.find
  // match the wrong report. Dedupe here, keeping the first occurrence, so that
  // assumption actually holds.
  const seenLeadUrls = new Set<string>();
  let leads = siteLeads.filter((lead) => {
    if (seenLeadUrls.has(lead.url)) return false;
    seenLeadUrls.add(lead.url);
    return true;
  });

  if (leads.length > AGENT_CONFIG.maxLeadsPerRun) {
    log(
      `Capping ${leads.length} leads at ${AGENT_CONFIG.maxLeadsPerRun}; dropped: ${leads
        .slice(AGENT_CONFIG.maxLeadsPerRun)
        .map((l) => l.url)
        .join(', ')}`,
    );
    leads = leads.slice(0, AGENT_CONFIG.maxLeadsPerRun);
  }

  log(`${leads.length} lead(s), ${aggregatorRows.length} aggregator row(s) past watermark`);

  const leadReports: LeadReport[] = [];
  const extractedPolls: NormalizedPoll[] = [];

  for (const lead of leads) {
    log(`  ${lead.agency}: ${lead.url}`);
    const { report, poll } = await processLead(
      lead,
      watermarks[lead.agency] ?? null,
      aggregatorRows,
      client,
    );
    leadReports.push(report);
    if (poll != null) extractedPolls.push(poll);
  }

  const merged = mergePolls(existingPolls, extractedPolls, {
    processedDataUntil: PIPELINE_CONFIG.processedDataUntil,
  });

  for (const rejection of merged.rejected) {
    const report = leadReports.find((r) => r.url === rejection.poll.sourceUrl);
    if (report != null) {
      report.outcome = 'skipped';
      report.reason = rejection.reason;
    }
  }

  const withSeats = merged.polls.map((poll) =>
    merged.added.some((added) => added.id === poll.id)
      ? withSeatProjection(poll, rules)
      : poll,
  );

  for (const added of merged.added) {
    const report = leadReports.find((r) => r.url === added.sourceUrl);
    if (report != null) report.pollId = added.id;
  }

  const addedMonths = new Set(
    merged.added.map((p) => `${p.agency}|${p.fieldworkEnd.slice(0, 7)}`),
  );
  const aggregatorGaps = aggregatorRows.filter(
    (row) => !addedMonths.has(`${row.agency}|${row.fieldworkEnd.slice(0, 7)}`),
  );

  const report: AgentRunReport = {
    runDate: today(),
    watermarks,
    leadCount: leads.length,
    leads: leadReports,
    aggregatorGaps,
    addedPolls: merged.added,
  };

  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(
    join(LOG_DIR, `agent-run-${report.runDate}.json`),
    JSON.stringify(report, null, 2),
    'utf-8',
  );
  await writeFile(join(LOG_DIR, 'pr-body.md'), renderPrBody(report), 'utf-8');
  await writeFile(
    join(LOG_DIR, 'commit-message.txt'),
    `${renderCommitMessage(report)}\n`,
    'utf-8',
  );

  const changed = merged.added.length > 0;

  if (changed && !DRY_RUN) {
    await writeAtomic(POLLS_PATH, `${JSON.stringify(withSeats, null, 2)}\n`);
    log(`Wrote ${merged.added.length} new poll(s) to ${POLLS_PATH}`);
  } else if (changed) {
    log(`Dry run: would have added ${merged.added.map((p) => p.id).join(', ')}`);
  } else {
    log('No new polls.');
  }

  if (process.env.GITHUB_OUTPUT != null) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `changed=${changed && !DRY_RUN ? 'true' : 'false'}\n`,
      'utf-8',
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: every suite passes.

- [ ] **Step 4: Dry-run against the live sites**

This makes real HTTP requests and real API calls. It needs a key:

```bash
ANTHROPIC_API_KEY=sk-... npm run ingest:agent -- --dry-run --verbose
```

Expected output: watermarks for the three agencies, a lead count, and either "No new polls." or a list of polls it would add. `scripts/agent/logs/pr-body.md` is written either way — read it and check it reads sensibly.

If it reports leads that are obviously not poll releases, tighten the triage system prompt in `scripts/agent/leads/triage.ts` and re-run. If it extracts a poll you already have, confirm the watermark logic caught it (`skipped: not newer than the watermark`).

- [ ] **Step 5: Force an end-to-end extraction**

To exercise extraction even in a quiet week, roll the watermark back:

```bash
ANTHROPIC_API_KEY=sk-... npm run ingest:agent -- --dry-run --verbose --agency=AKO --since=2026-05-01
```

Expected: it finds AKO's June/July releases, extracts them, and grounding passes for essentially every party. Compare a handful of extracted values against `public/data/sk/polls.json` — they should match the polls already there. **Any disagreement is a bug in extraction or grounding, not a new data point.** Fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add scripts/agent/run.ts
git commit -m "Add poll watch orchestration"
```

---

## Task 19: Drop NMS

`NMS` is configured but has produced zero polls (`polls.json` has AKO 70, Focus 49, Ipsos 30). Every run currently fetches nms-mr.com for nothing, and leaving it in the agency union means the agent can only generate noise from it.

**Files:**
- Modify: `scripts/ingestion/config.ts`, `scripts/ingestion/run.ts`, `scripts/ingestion/types.ts`, `scripts/ingestion/validate/schema.ts`, `scripts/ingestion/parsers/index.ts`, `scripts/ingestion/fetchers/index.ts`, `src/data/types.ts`, `scripts/ingestion/README.md`
- Delete: `scripts/ingestion/fetchers/nms.ts`, `scripts/ingestion/parsers/nms.ts`

- [ ] **Step 1: Confirm no NMS poll exists**

```bash
node -e "const p=require('./public/data/sk/polls.json'); console.log(p.filter(x=>x.agency==='NMS').length)"
```
Expected: `0`. If it prints anything else, stop — do not delete a source that has data.

- [ ] **Step 2: Remove the agency from both type unions**

In `scripts/ingestion/types.ts:4` and `src/data/types.ts:25`:

```typescript
export type PollAgency = 'Focus' | 'AKO' | 'Ipsos';
```

- [ ] **Step 3: Remove it from validation**

In `scripts/ingestion/validate/schema.ts:3`:

```typescript
const AGENCIES: PollAgency[] = ['Focus', 'AKO', 'Ipsos'];
```

- [ ] **Step 4: Remove the source and the wiring**

- In `scripts/ingestion/config.ts`, delete the whole `NMS: { ... }` entry from `sources`.
- In `scripts/ingestion/run.ts`, delete `NMS` from `ALL_AGENCIES`, the `fetchNMS` import and call, the `parseNMS` import and call, and `nmsResult` from the `allRawPolls` / `allSkips` spreads.
- Delete the `nms` exports from `scripts/ingestion/fetchers/index.ts` and `scripts/ingestion/parsers/index.ts`.

```bash
rm scripts/ingestion/fetchers/nms.ts scripts/ingestion/parsers/nms.ts
```

- [ ] **Step 5: Remove the NMS row from the ingestion README**

In `scripts/ingestion/README.md`, delete the `**NMS**` row from the sources table and any NMS mention in the prose.

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc -b && npm run build`
Expected: all clean.

```bash
grep -ri "nms" scripts src README.md
```
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add -A scripts src README.md
git commit -m "Drop NMS: configured for years, never produced a poll"
```

---

## Task 20: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/poll-watch.yml`
- Modify: `.gitignore`

- [ ] **Step 0: Stop .gitignore from swallowing the run report**

`.gitignore` line 2 is a bare `logs`, which matches any directory named `logs` anywhere in
the tree — it is why `scripts/ingestion/logs/` has never been tracked. Left alone, the
workflow's `git add scripts/agent/logs` would silently add nothing and the PR would arrive
with no report, which is the one artifact the review depends on. A negation cannot rescue
a file whose parent directory is excluded, so the directory itself must be un-ignored.

Add immediately after the `logs` line in `.gitignore`:

```gitignore
!scripts/agent/logs/
!scripts/agent/logs/**
```

Verify:

```bash
git check-ignore scripts/agent/logs/pr-body.md; echo "exit: $?"
```
Expected: exit `1` and no output — meaning the path is **not** ignored. **Do not add `-v`
to this check**: on some git versions, `-v` prints the matching pattern (correctly showing
the negation rule) but still reports exit code `0`, which looks like a failure but isn't —
the plain (no `-v`) form is the one whose exit code is reliable here.

- [ ] **Step 1: Add the repository secret**

The maintainer must add `ANTHROPIC_API_KEY` under Settings → Secrets and variables → Actions. The workflow cannot create it. If you do not have access, say so and stop before the first scheduled run.

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/poll-watch.yml`:

```yaml
name: Poll watch

on:
  schedule:
    # Mondays 06:00 UTC
    - cron: '0 6 * * 1'
  workflow_dispatch:
    inputs:
      agency:
        description: 'Limit to one agency (AKO, Focus, Ipsos). Empty = all.'
        required: false
        default: ''
      dry_run:
        description: 'Do everything except writing polls.json and opening a PR'
        type: boolean
        default: false

permissions:
  contents: write
  pull-requests: write
  # Assignee management (gh pr create --assignee) goes through the Issues API even for
  # pull requests, so pull-requests: write alone isn't enough — needs issues: write too.
  issues: write

concurrency:
  group: poll-watch
  cancel-in-progress: false

jobs:
  watch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - run: npm ci

      - name: Run the poll watch agent
        id: agent
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          AGENCY: ${{ github.event.inputs.agency }}
          DRY_RUN: ${{ github.event.inputs.dry_run }}
        run: |
          set -euo pipefail
          ARGS=""
          if [ -n "${AGENCY:-}" ]; then
            ARGS="$ARGS --agency=$AGENCY"
          fi
          if [ "${DRY_RUN:-false}" = "true" ]; then
            ARGS="$ARGS --dry-run"
          fi
          npm run ingest:agent -- $ARGS

      - name: Open or update the PR
        if: steps.agent.outputs.changed == 'true'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          set -euo pipefail
          # One branch per ISO week, so a manual re-run updates the scheduled run's PR
          # instead of opening a second one. The branch is bot-owned; force-push is safe.
          BRANCH="polls/auto-$(date -u +%G-W%V)"

          git config user.name "poll-watch[bot]"
          git config user.email "poll-watch@users.noreply.github.com"

          git checkout -B "$BRANCH"
          git add public/data/sk/polls.json scripts/agent/logs
          git commit -F scripts/agent/logs/commit-message.txt
          git push --force origin "$BRANCH"

          EXISTING=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
          if [ -z "$EXISTING" ]; then
            gh pr create \
              --base main \
              --head "$BRANCH" \
              --title "$(head -n 1 scripts/agent/logs/commit-message.txt)" \
              --body-file scripts/agent/logs/pr-body.md \
              --assignee peterjurco \
              --reviewer peterjurco
          else
            gh pr edit "$EXISTING" --body-file scripts/agent/logs/pr-body.md
            gh pr comment "$EXISTING" --body "Re-run on $(date -u +%F) updated this PR."
          fi
```

- [ ] **Step 3: Check the workflow parses**

```bash
npx --yes yaml-lint .github/workflows/poll-watch.yml
```
Expected: no errors. GitHub also reports workflow syntax errors on push, so a failure here is worth fixing before the push in the next step.

- [ ] **Step 4: Commit and push the branch**

```bash
git add .github/workflows/poll-watch.yml
git commit -m "Add weekly poll watch workflow"
git push -u origin HEAD
```

- [ ] **Step 5: Trigger a dry run from the Actions tab**

Run it manually with `dry_run: true`:

```bash
gh workflow run "Poll watch" --ref "$(git rev-parse --abbrev-ref HEAD)" -f dry_run=true
gh run watch
```

Expected: the job succeeds and the "Open or update the PR" step is skipped (`changed` is `false` on a dry run by design). Read the job log and confirm the watermarks and lead count look right.

If the run fails on a missing `ANTHROPIC_API_KEY`, the secret is not set — report that to the maintainer rather than working around it.

- [ ] **Step 6: Trigger a real run**

```bash
gh workflow run "Poll watch" --ref "$(git rev-parse --abbrev-ref HEAD)"
gh run watch
```

Expected: either "No new polls." and no PR, or a PR assigned to `peterjurco` with the rendered body. Open the PR and check the diff touches only `public/data/sk/polls.json` and `scripts/agent/logs/`.

---

## Task 21: Documentation

**Files:**
- Create: `scripts/agent/README.md`
- Modify: `README.md`

- [ ] **Step 1: Write the agent README**

Create `scripts/agent/README.md`:

```markdown
# Poll watch agent

Weekly job that looks for a new poll from **AKO, Focus or Ipsos**, extracts it with Claude,
verifies it against the source text, and opens a PR. It never merges, never pushes to
`main`, and never decides anything ambiguous — ambiguity goes in the PR body for a human.

## Run it

```bash
npm run ingest:agent                                    # real run, writes polls.json
npm run ingest:agent -- --dry-run --verbose             # everything except the write
npm run ingest:agent -- --agency=AKO --since=2026-05-01 # replay a window for debugging
```

Needs `ANTHROPIC_API_KEY` in the environment. In CI it comes from the repository secret of
the same name.

## What a run does

1. **Watermark** — the latest `fieldworkEnd` per agency in `polls.json`. Nothing older is
   ever considered.
2. **Leads** — each agency's list pages are fetched, every link harvested, and the model
   picks the ones that look like a new poll release. Model-returned URLs are filtered back
   against the harvested list, so an invented URL cannot become a lead.
3. **Extract** — each lead document (HTML or PDF) is read by the model into fieldwork
   dates, sample size and **verbatim** party labels with percentages.
4. **Ground** — every extracted number must appear in the source text near its party name.
   A failure is flagged in the PR, not blocked: some agencies publish values only inside
   chart images.
5. **Normalize and validate** — the existing `scripts/ingestion/` code maps labels to
   slugs and validates the poll. Unrecognised parties are dropped **and reported**.
6. **Cross-check** — where the aggregator table lists the same poll, values are diffed
   (0.1 pp tolerance) and differences reported.
7. **Merge and project seats** — the poll is appended (existing polls are never modified,
   because their ids live in visitors' saved coalitions) and seat projections computed.
8. **Report** — `logs/agent-run-YYYY-MM-DD.json`, `logs/pr-body.md`,
   `logs/commit-message.txt`. The workflow turns those into a branch and a PR.

## Where the model is allowed to act

Two places only: picking candidate links, and reading values out of one document. Slug
mapping, validation, dedup, merging, seat projection and the PR body are all deterministic
code with unit tests. The model never sees `polls.json`.

## When something is wrong

- **Wrong number in a PR** — check the grounding section of the PR body first. If grounding
  passed, the document itself contains that number and the model probably read the wrong
  column; tighten the extraction prompt in `extract.ts`.
- **A poll was missed** — run with `--since=` set before the missing poll and `--verbose`
  to see whether the lead was found at all. No lead means triage or the list URL; a lead
  that was skipped will say why in the report.
- **Junk leads** — tighten the triage prompt in `leads/triage.ts`.
- **A new party** — add it to `public/data/sk/parties.json`; the slug list is derived from
  that file, so nothing else needs changing.
```

- [ ] **Step 2: Add a section to the root README**

In `README.md`, after the `## Data` section, insert:

```markdown
## Automated poll watch

A weekly GitHub Action (`.github/workflows/poll-watch.yml`) checks AKO, Focus and Ipsos for
polls newer than the latest one on file, extracts them with Claude, verifies each number
against the source document, and opens a PR for review. It never writes to `main`. See
`scripts/agent/README.md`.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/agent/README.md README.md
git commit -m "Document the poll watch agent"
```

---

## Task 22: Final verification

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all suites pass. Record the count.

- [ ] **Step 2: Type check and build**

Run: `npx tsc -b && npm run build && npm run lint`
Expected: all clean.

- [ ] **Step 3: Confirm the app still loads the data**

Run the dev server and check the polls render (the agent changes `polls.json`'s shape not at all, but a stray write would show up here):

```bash
npm run dev
```
Expected: the app loads and the trend chart shows polls through the latest month.

- [ ] **Step 4: Confirm nothing writes to main**

```bash
grep -n "push" .github/workflows/poll-watch.yml
```
Expected: exactly one `git push --force origin "$BRANCH"`, and `$BRANCH` is only ever `polls/auto-*`.

- [ ] **Step 5: Report**

State plainly: tests passing, what the dry run found, whether a real run has opened a PR yet, and anything left for the maintainer (the `ANTHROPIC_API_KEY` secret, if it is still missing).
