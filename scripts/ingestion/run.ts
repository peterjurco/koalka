/**
 * Ingestion pipeline: fetch → parse → normalize → validate → export.
 * Run from repo root: npx tsx scripts/ingestion/run.ts
 *
 * Optional:
 *   --agency=AKO or --agency=Focus,AKO  (only run these agencies; default: all)
 *   --party=slug          (only include polls that have results for this party, e.g. --party=ps, --party=smer)
 *   --dateFrom=YYYY-MM-DD  (only include polls with fieldwork in range)
 *   --dateTo=YYYY-MM-DD   (inclusive; with dateFrom limits output to this window)
 *   --verbose, -v         (log each file/source and the data parsed from it)
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";
import { PIPELINE_CONFIG } from "./config.ts";
import { exportPolls } from "./export.ts";
import { shortFetchError } from "./fetch/shared.ts";
import {
  fetchAKO,
  fetchFocus,
  fetchIpsos,
  fetchNMS,
} from "./fetchers/index.ts";
import { normalizePolls } from "./normalize/index.ts";
import { parseAKO, parseFocus, parseIpsos, parseNMS } from "./parsers/index.ts";
import type {
  FetchedDocument,
  NormalizedPoll,
  PollAgency,
  RawPoll,
  SkipReason,
} from "./types.ts";
import { validatePolls } from "./validate/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");

const ALL_AGENCIES: PollAgency[] = ["Focus", "AKO", "Ipsos", "NMS"];

function parseAgencyArg(): Set<PollAgency> | null {
  const arg = process.argv.find(
    (a) => a.startsWith("--agency=") || a === "--agency",
  );
  if (!arg) return null;
  const value =
    arg === "--agency"
      ? process.argv[process.argv.indexOf("--agency") + 1]
      : arg.slice(9);
  if (!value) return null;
  const names = value.split(",").map((s) => s.trim());
  const set = new Set<PollAgency>();
  for (const n of names) {
    if (ALL_AGENCIES.includes(n as PollAgency)) set.add(n as PollAgency);
  }
  return set.size > 0 ? set : null;
}

function parseDateArg(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!arg) return null;
  const value = arg.slice(`--${name}=`.length).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parsePartyArg(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--party="));
  if (!arg) return null;
  const value = arg.slice("--party=".length).trim().toLowerCase();
  return value.length > 0 ? value : null;
}

function parseVerboseArg(): boolean {
  return (
    process.argv.includes("--verbose") ||
    process.argv.includes("-v")
  );
}

/** Fill pdfText for documents that have pdfBuffer. */
async function extractPdfText(docs: FetchedDocument[]): Promise<void> {
  for (const doc of docs) {
    if (!doc.pdfBuffer) continue;
    try {
      const parser = new PDFParse({ data: Buffer.from(doc.pdfBuffer) });
      const result = await parser.getText();
      doc.pdfText = result.text ?? "";
      await parser.destroy();
    } catch (e) {
      console.warn(`PDF parse failed for ${doc.url}: ${shortFetchError(e)}`);
    }
  }
}

async function main(): Promise<void> {
  const agencyFilter = parseAgencyArg();
  const agencies = agencyFilter ?? new Set(ALL_AGENCIES);
  if (agencyFilter) {
    console.log(`Agency filter: ${[...agencies].join(", ")}`);
  }

  const dateFrom = parseDateArg("dateFrom");
  const dateTo = parseDateArg("dateTo");
  const fetchOptions =
    dateFrom != null || dateTo != null
      ? { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null }
      : undefined;
  if (fetchOptions) {
    console.log(`Date window (fetch): ${dateFrom ?? "…"} to ${dateTo ?? "…"}`);
  }

  const verbose = parseVerboseArg();
  if (verbose) console.log("Verbose: on");

  const allSkips: SkipReason[] = [];
  const allRawPolls: RawPoll[] = [];

  console.log("Fetching...");
  const [focusDocs, akoDocs, nmsDocs, ipsosDocs] = await Promise.all([
    agencies.has("Focus") ? fetchFocus(fetchOptions) : Promise.resolve([]),
    agencies.has("AKO") ? fetchAKO(fetchOptions) : Promise.resolve([]),
    agencies.has("NMS") ? fetchNMS() : Promise.resolve([]),
    agencies.has("Ipsos") ? fetchIpsos() : Promise.resolve([]),
  ]);

  if (agencies.has("AKO")) await extractPdfText(akoDocs);
  if (agencies.has("Focus")) await extractPdfText(focusDocs);

  console.log("Parsing...");
  const parseOpts = verbose ? { verbose: true as const } : undefined;
  if (verbose && focusDocs.length) console.log("Focus:");
  const focusResult = parseFocus(focusDocs, parseOpts);
  if (verbose && akoDocs.length) console.log("AKO:");
  const akoResult = parseAKO(akoDocs, parseOpts);
  if (verbose && nmsDocs.length) console.log("NMS:");
  const nmsResult = parseNMS(nmsDocs, parseOpts);
  if (verbose && ipsosDocs.length) console.log("Ipsos:");
  const ipsosResult = parseIpsos(ipsosDocs, parseOpts);

  allRawPolls.push(
    ...focusResult.rawPolls,
    ...akoResult.rawPolls,
    ...nmsResult.rawPolls,
    ...ipsosResult.rawPolls,
  );
  allSkips.push(
    ...focusResult.skips,
    ...akoResult.skips,
    ...nmsResult.skips,
    ...ipsosResult.skips,
  );

  console.log("Normalizing...");
  const { polls: normalizedPolls, skips: normSkips } = normalizePolls(
    allRawPolls,
    PIPELINE_CONFIG.countryId,
    PIPELINE_CONFIG.electionId,
  );
  allSkips.push(...normSkips);

  console.log("Validating...");
  const { polls: validPolls, skips: validSkips } = validatePolls(
    normalizedPolls,
    {
      fieldworkStartMin: PIPELINE_CONFIG.fieldworkStartMin,
      fieldworkEndMax: PIPELINE_CONFIG.fieldworkEndMax,
    },
  );
  allSkips.push(...validSkips);

  const partySlug = parsePartyArg();
  let pollsToExport: NormalizedPoll[] = validPolls;
  if (dateFrom ?? dateTo) {
    pollsToExport = pollsToExport.filter((p) => {
      if (dateFrom != null && p.fieldworkEnd < dateFrom) return false;
      if (dateTo != null && p.fieldworkStart > dateTo) return false;
      return true;
    });
    console.log(
      `Date filter (output): ${dateFrom ?? "…"} to ${dateTo ?? "…"} → ${pollsToExport.length} polls`,
    );
  }
  if (partySlug != null) {
    pollsToExport = pollsToExport.filter((p) => p.results[partySlug] != null);
    console.log(`Party filter: ${partySlug} → ${pollsToExport.length} polls`);
  }

  if (verbose && pollsToExport.length > 0) {
    console.log('');
    console.log(`Polls to export (${pollsToExport.length}):`);
    const filterParts: string[] = [];
    if (partySlug != null) {
      filterParts.push(`only polls that have --party=${partySlug}`);
    } else {
      filterParts.push('all polls (no --party filter)');
    }
    if (dateFrom != null || dateTo != null) {
      filterParts.push(`date window ${dateFrom ?? '…'} to ${dateTo ?? '…'}`);
    } else {
      filterParts.push('no date filter');
    }
    console.log(`  Output filters: ${filterParts.join('; ')}`);
    console.log('  Each poll is written with all its normalized party results (full poll).');
    console.log('');
    for (const p of pollsToExport) {
      const parties = Object.keys(p.results).sort().join(', ');
      const idLabel = p.id || `${p.agency} ${p.fieldworkStart.slice(0, 7)}`;
      console.log(`  ${idLabel}  fieldwork ${p.fieldworkStart} – ${p.fieldworkEnd}  n=${p.sampleSize}`);
      console.log(`    parties: ${parties}`);
      if (partySlug != null) {
        console.log(`    included because: poll has result for --party=${partySlug}`);
      } else {
        console.log(`    included because: no party filter (all validated polls)`);
      }
      console.log('');
    }
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outputPath = join(REPO_ROOT, "public/data/sk/polls.json");
  const skipLogPath = join(
    REPO_ROOT,
    `scripts/ingestion/logs/skipped-${today}.json`,
  );

  console.log("Exporting...");
  const totalWritten = await exportPolls(pollsToExport, allSkips, {
    outputPath,
    skipLogPath,
    pretty: true,
    processedDataUntil: PIPELINE_CONFIG.processedDataUntil,
  });

  console.log(`Wrote ${totalWritten} polls to ${outputPath}`);
  if (allSkips.length > 0) {
    console.log(`Logged ${allSkips.length} skipped to ${skipLogPath}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
