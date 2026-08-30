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
    // No effort param: the triage model (Haiku 4.5) doesn't support it at all — sending
    // it returns a 400 "This model does not support the effort parameter."
  });

  if (parsed == null) return [];

  const known = new Set(links.map((link) => link.url));
  return parsed.candidates.filter((candidate) => known.has(candidate.url));
}
