# Slovak Parliamentary Polls Ingestion Pipeline

Reproducible pipeline: **fetch → parse → normalize → validate → export**. Produces one JSON file of Slovak parliamentary opinion polls (2020–present) from Focus, AKO, and Ipsos.

## Run

From repo root:

```bash
npm run ingest
```

Or:

```bash
npx tsx scripts/ingestion/run.ts
```

**Run only specific agencies** (e.g. AKO only, faster):

```bash
npm run ingest -- --agency=AKO
npx tsx scripts/ingestion/run.ts --agency=AKO
# or multiple: --agency=AKO,Focus
```

**Limit to a date range** (only fetch and include polls in the window). Date is parsed at the start and applied **before fetching**: AKO skips PDFs whose URL path is before `dateFrom`/after `dateTo`; Focus skips report pages outside the range. Output is also filtered by the same range.

```bash
npm run ingest -- --dateFrom=2024-01-01 --dateTo=2024-12-31
```

**Only include polls that have results for a specific party** (useful for smaller datasets or debugging; poll objects still contain all parties’ results):

```bash
npm run ingest -- --party=ps
npm run ingest -- --party=smer --agency=Focus
```

Party slug must match `public/data/sk/parties.json` (e.g. `ps`, `smer`, `hlas`, `sas`, `republika`).

**Requirements:** Node 18+, dependencies installed (`npm install`). No env vars required.

### Verified data (don’t overwrite)

In `config.ts`, set `processedDataUntil` to a date (YYYY-MM-DD) once you have checked and verified data up to that date. Example: `processedDataUntil: "2024-12-31"`. On the next ingest run, any poll in the existing `polls.json` with `fieldworkEnd <=` that date will be **kept as-is** and not replaced by newly scraped data. Only newer polls (or polls not yet in the file) will be added/updated. Set to `undefined` to allow full overwrite every time.

## Output

- **Polls:** `public/data/sk/polls.json` — sorted by `fieldworkStart` ascending, deterministic IDs `sk-{agency}-{YYYY-MM}` or `sk-{agency}-{YYYY-MM}-{DD}` when multiple per month.
- **Skip log:** `scripts/ingestion/logs/skipped-YYYYMMDD.json` — polls skipped (missing sampleSize, invalid data, duplicates, out-of-range dates).

## Config

Edit `scripts/ingestion/config.ts`:

- `electionId` — e.g. `sk-2024` or `sk-next-nrsr`
- `fieldworkStartMin` / `fieldworkEndMax` — date range (default 2020-01-01 to today)
- `processedDataUntil` — optional; if set (YYYY-MM-DD), existing polls with fieldworkEnd ≤ this date are never overwritten (see above).
- `sources` — per-agency list URLs; see below.

### What to put in `sources.listUrls`

Each agency expects **pages the pipeline can fetch** that contain (or link to) **one or more polls** with a **result table** (party + %) and **sample size** and **fieldwork dates**. Use original sources where possible.

| Agency | What to use | Example / notes |
|--------|-------------|------------------|
| **AKO** | Official archive page that **lists PDFs** of monthly polls. The pipeline fetches this HTML; the parser can be extended to discover `href="*.pdf"` and fetch each PDF. PDFs are usually under `ako.sk/wp-content/uploads/.../ag.AKO_VOLEBNE_PREF_*.pdf`. | `https://ako.sk/referencie/prieskumy-volebnych-preferencii/` |
| **Ipsos** | **Denník N** often publishes Ipsos polls. There is no single “tag” page that works; use **direct URLs of articles** that contain the Ipsos poll table and sample size. Add more URLs to include more months. | Search “Ipsos prieskum” on dennikn.sk and add the article URLs to `listUrls`. |
| **Focus** | **focus-research.sk** press centrum: the fetcher loads the list page and collects all "Volebné preferencie politických strán" report URLs (parliamentary only; excludes presidential). Each report page is fetched; if it has no HTML table, the "Tlačová správa" PDF is fetched. CSV from "Stiahnuť údaje" is used when present. | Single list URL: `https://www.focus-research.sk/press-centrum/` |

If a URL returns 404 or TLS errors, the pipeline logs one short line and continues; update the URL in config when the source moves.

## Pipeline stages

1. **Fetch** — One fetcher per agency (`fetchers/`). Fetches HTML list pages and, for AKO, PDFs. Rate-limited, optional User-Agent.
2. **Parse** — One parser per agency (`parsers/`). HTML: cheerio tables + shared date/sample regex. PDF: text from pdf-parse + line-based party/percentage extraction. Polls without `sampleSize` are not emitted; they go to the skip log.
3. **Normalize** — Party names → canonical slugs (`normalize/partySlugs.ts`), dates → `YYYY-MM-DD` (`normalize/dates.ts`), numeric validation. Unknown parties can be added as aliases in `partySlugs.ts`.
4. **Validate** — Schema (required fields, ≥3 parties, valid agency), dedup by `(agency, fieldworkStart, fieldworkEnd)`, time filter.
5. **Export** — Assign IDs, sort, write JSON and skip log.

## Adding or changing sources

- **New URL for an agency:** Change `PIPELINE_CONFIG.sources.{Agency}.listUrls` in `config.ts`.
- **New agency:** Add fetcher in `fetchers/`, parser in `parsers/`, wire both in `run.ts` and add agency to the `PollAgency` type in `types.ts` and `validate/schema.ts`.
- **New party alias:** Add in `normalize/partySlugs.ts` via `add(canonicalSlug, ...aliases)`.

## Schema (output)

Each poll in `polls.json`:

- `id`, `countryId`, `electionId`, `agency`, `fieldworkStart`, `fieldworkEnd`, `sampleSize` (required), `sourceUrl`, `results` (party slug → percentage)
- `methodology`: optional `{ mode?, panel?, weighting?, notes?, client? }`
- `metadata`: optional `{ turnout?, seatProjection? }`

The app in `src/` reads this file via `jsonLoader`; types are shared in `src/data/types.ts`.
