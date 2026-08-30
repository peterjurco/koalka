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
3. **Resolve** — a fetched HTML lead with no data table of its own (Focus's report pages
   usually have none) is followed one hop to its linked PDF/CSV before extraction, mirroring
   what the older `scripts/ingestion/` pipeline already does for Focus.
4. **Extract** — each resolved document (HTML or PDF) is read by the model into fieldwork
   dates, sample size and **verbatim** party labels with percentages.
5. **Ground** — every extracted number must appear in the source text near its party name.
   A failure is flagged in the PR, not blocked: some agencies publish values only inside
   chart images.
6. **Normalize and validate** — the existing `scripts/ingestion/` code maps labels to
   slugs and validates the poll. Unrecognised parties are dropped **and reported**.
7. **Cross-check** — where the aggregator table lists the same poll, values are diffed
   (0.1 pp tolerance) and differences reported.
8. **Merge and project seats** — the poll is appended (existing polls are never modified,
   because their ids live in visitors' saved coalitions) and seat projections computed.
9. **Report** — `logs/agent-run-YYYY-MM-DD.json`, `logs/pr-body.md`,
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
  that was skipped will say why in the report. If the lead was found but extraction found
  no usable data, check whether the page needed the resolve-to-PDF/CSV hop (`resolveDocument.ts`)
  and whether that hop's structural assumptions (no table + exactly one PDF/CSV link) still
  hold against the current page.
- **Junk leads** — tighten the triage prompt in `leads/triage.ts`.
- **A new party** — add it to `public/data/sk/parties.json`; the slug list is derived from
  that file, so nothing else needs changing.
