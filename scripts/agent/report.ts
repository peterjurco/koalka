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
