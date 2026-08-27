# Poll Watch Agent — Design

**Date:** 2026-08-27
**Status:** Approved, not yet implemented

## Problem

`polls.json` is kept current by hand. The deterministic scraper in `scripts/ingestion/`
exists but has not been what actually lands new data: AKO Jun/Jul 2026, Focus Jun 2026 and
Ipsos Jun 2026 were all added as hand-written commits, along with two new parties
(`strana_vidieka`, `pravo_na_pravdu`).

Two things fail:

1. **Extraction.** The regex/cheerio parsers break when an agency changes its page or PDF
   layout.
2. **Detection.** Nobody is watching, so a new release sits unnoticed until it is noticed
   by accident.

## Goal

A scheduled job that notices a new poll from an agency already tracked, extracts it,
validates it, and opens a PR. Every judgment call is surfaced in the PR rather than
resolved by the agent; the human (in a follow-up AI session over the PR) decides and
merges.

## Non-goals

- Discovering new polling agencies. The agency list is fixed: **AKO, Focus, Ipsos**.
- Adding parties to `parties.json`.
- Correcting or backfilling historical polls.
- Merging or deploying. The job's output is a PR, nothing more.

## Trust boundary

The model is allowed to act in exactly two places:

1. Choosing which links on an agency page look like a new poll release.
2. Reading field values out of a single fetched document.

Everything else is deterministic code: slug mapping, date normalization, schema
validation, dedup, merging, seat projection, PR body rendering. **The model never sees
`polls.json` and never decides what is written.**

The failure this is shaped around is a run that quietly ingests a plausible-looking wrong
number — a poll with a silently wrong `smer` value is worse than a missed poll.

## Run flow

Weekly, Monday 06:00 UTC, plus manual dispatch.

1. **Watermarks** — read `public/data/sk/polls.json`, compute max `fieldworkEnd` per
   agency. All later stages are scoped to "newer than that".
   Current values: AKO `2026-07-14`, Focus `2026-06-29`, Ipsos `2026-06-23`.

2. **Leads** — two independent sources, unioned and deduped by `(agency, approximate date)`:

   - *Agency sites.* Fetch the configured list pages. Harvest every link
     deterministically (href, anchor text, surrounding text). Hand the model that compact
     list; it returns which links are parliamentary preference releases plausibly newer
     than the watermark. A link list is a cheap, low-risk thing to ask a model about, and
     it survives the URL-naming changes that break the current regex approach.
   - *Aggregator.* Fetch the Wikipedia "Opinion polling for the next Slovak parliamentary
     election" table; parse rows for the three agencies past the watermark. Yields both a
     lead and an expected value set for the later cross-check. The aggregator is used to
     know *what to look for* — never as the source of the numbers.

   **Zero leads → exit 0, no PR.**

3. **Fetch** — pull each lead document (HTML, or PDF through the existing `pdf-parse`
   path). Rate-limited and User-Agent'd per `PIPELINE_CONFIG`.

4. **Extract** — one model call per document, structured output: `agency`,
   `fieldworkStart`, `fieldworkEnd`, `sampleSize`, `sourceUrl`, and `results` as
   **verbatim party names → numbers**. The model does not emit slugs; mapping stays in
   `normalize/partySlugs.ts`, so a party rename is a data change rather than a model whim.

5. **Ground** — for each `(party, value)` pair, verify the number appears in the source
   text near that party's name, handling `17,8`, `17.8` and `17,8 %`. Pure string
   matching, no second model call. A hallucinated digit is not in the document.
   Grounding failure is a **PR flag, not a hard block**: the poll is still ingested and
   the failing pairs are listed in the PR's "needs your attention" section. Some agencies
   publish values only inside chart images, where verbatim matching cannot succeed, so a
   hard block would stall those agencies permanently.

6. **Normalize → validate** — the existing `scripts/ingestion/normalize` and
   `scripts/ingestion/validate` stages, unchanged.

7. **Cross-check** — where an aggregator row exists for the same poll, diff fieldwork
   dates, sample size, and per-party values. Tolerance: party values within 0.1 pp are
   equal, dates and sample size must match exactly. Mismatches are recorded as warnings,
   never blocks — the aggregator is secondhand and can itself be wrong or stale.

8. **Merge** — insert into `polls.json`, honouring `processedDataUntil` and never
   overwriting an existing poll; re-sort by `fieldworkStart`. Then recompute
   `metadata.seatProjection` for the new polls using the existing Hagenbach-Bischoff
   allocation in `src/core/allocation/`.

9. **Report + PR** — write `scripts/agent/logs/agent-run-YYYY-MM-DD.json`, commit to
   branch `polls/auto-YYYY-Www` (ISO week, so a manual run in the same week updates the
   scheduled run's PR instead of opening a second one), open a PR whose body is rendered
   *from the report* by deterministic code, not written by the model.

## Modules

New code lives in `scripts/agent/`, reusing `scripts/ingestion/`'s normalize, validate,
export and types unchanged.

| Module | Responsibility | Pure |
|---|---|---|
| `watermarks.ts` | `computeWatermarks(polls) → Record<Agency, string>` | yes |
| `leads/fromAgencySites.ts` | fetch list pages, harvest links, model triage → `Lead[]` | no |
| `leads/fromAggregator.ts` | fetch Wikipedia; `parseAggregatorTable(html) → Row[]` | parse only |
| `extract.ts` | `extractPoll(docText, url, agency) → RawExtraction` | no |
| `grounding.ts` | `checkGrounding(docText, results) → GroundingResult[]` | yes |
| `crosscheck.ts` | `diff(extraction, aggregatorRow) → Mismatch[]` | yes |
| `merge.ts` | insert into polls.json, respect `processedDataUntil`, no overwrite, re-sort | yes |
| `report.ts` | build report object; render Markdown PR body | yes |
| `claude.ts` | Anthropic SDK wrapper — model ids, retries, structured output | no |
| `run.ts` | orchestration only, no logic | no |

**Models:** Sonnet 5 (`claude-sonnet-5`) for extraction, Haiku 4.5
(`claude-haiku-4-5-20251001`) for link triage. At roughly three polls a month the cost is
negligible; Sonnet is the right tier for reading a table.

**CLI:** `npm run ingest:agent`, with `--dry-run` (everything except writing and opening
the PR), `--agency=`, and `--since=` for debugging.

## The report

The report is the handoff artifact for the follow-up session over the PR, so it must be
complete enough that no re-fetching is needed. Per lead:

- source URL
- raw verbatim extraction
- slug mapping applied
- **unmapped party names with their values**
- grounding pass/fail per `(party, value)` pair
- aggregator diff
- validation skip reasons

The PR body renders this as: what was added (agency, fieldwork dates, sample size),
followed by a "needs your attention" section listing unmapped parties, grounding failures,
and cross-check mismatches. **Nothing is silently dropped.** If a party like
`Strana vidieka` appears again, the poll lands without it and the PR states the name and
the value.

## Changes to existing code

- `CANONICAL_PARTY_SLUGS` in `scripts/ingestion/normalize/partySlugs.ts` becomes derived
  from `parties.json` instead of a hand-maintained duplicate. It is currently missing
  `strana_vidieka` and `pravo_na_pravdu`; that drift is exactly what would make the agent
  silently drop a party it should have mapped.
- `NMS` is removed from `PIPELINE_CONFIG.sources` and from the agency union. It has
  produced zero polls; keeping it burns fetches and can only generate noise. Trivial to
  re-add.

## GitHub Actions

`.github/workflows/poll-watch.yml`:

- `schedule: cron "0 6 * * 1"` and `workflow_dispatch` with optional `agency` and
  `dry_run` inputs.
- Node 22, `npm ci`, run the script.
- Permissions: `contents: write`, `pull-requests: write`.
- One secret: `ANTHROPIC_API_KEY`.
- PR opened with `gh pr create --assignee peterjurco --reviewer peterjurco` and an
  `@peterjurco` mention in the body, so both the mention and the review request generate
  email.

**Known caveat:** a PR opened with the default `GITHUB_TOKEN` does not trigger other
workflows on that PR. No CI workflows exist today, so this costs nothing; if a build check
is added later, these PRs will need a PAT or app token for it to run.

## Error handling

- A lead that fails to fetch, parse, or extract is recorded in the report; the run
  continues. One dead PDF link must not cost the other polls.
- `polls.json` is written once, atomically, at the end of the run. A crash mid-run leaves
  the working tree untouched.
- Anthropic API errors retry three times with backoff, then fail the job. A failed Action
  emails the maintainer, distinguishing "the agent is broken" from "no new polls".
- Re-running in the same ISO week reuses branch `polls/auto-YYYY-Www` and force-updates
  it rather than opening a second PR. An existing open PR for that branch is reused.
- The job never pushes to `main` and has no path that could.

## Testing

Vitest is already configured. Fixtures in `scripts/agent/__fixtures__/`: a real AKO PDF
text dump, a Focus report page, an Ipsos PDF text dump, a Wikipedia table snapshot.

Unit tests:

- `watermarks` — per-agency max, empty input, single agency.
- `grounding` — matches `17,8 %` / `17.8` / `17,8`; **rejects a near miss** such as an
  extracted `17.8` when the document says `17.3`; handles a value appearing far from the
  party name.
- `parseAggregatorTable` — parses the snapshot into rows; tolerates a missing sample size.
- `crosscheck` — flags a value delta above tolerance, ignores one below it, flags a date
  mismatch.
- `merge` — respects `processedDataUntil`, refuses to overwrite an existing poll,
  dedupes on `(agency, fieldworkStart, fieldworkEnd)`, keeps sort order.
- `report` — renders unmapped parties, grounding failures and mismatches into the body.

`extract` is tested against the fixtures with a mocked Claude client returning canned
responses. One live test exercising the real API, skipped by default.
