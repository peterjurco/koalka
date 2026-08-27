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
