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

/** Aggregator rows newer than their agency's watermark. */
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
