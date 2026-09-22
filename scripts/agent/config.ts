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
      // AKO's monthly poll is commissioned for JOJ24 television, which publishes the
      // full result (all parties, dates, sample size, seat projections) for free —
      // sometimes before AKO's own PDF appears on ako.sk at all.
      'https://joj24.noviny.sk/prieskumy',
    ],
    Focus: [
      'https://www.focus-research.sk/press-centrum/',
      // focus-research.sk has refused every connection from the CI runners since at least
      // 2026-09-07 (UND_ERR_CONNECT_TIMEOUT on the TCP connect, while the same URL loads
      // fine from a laptop) — so Focus polls went unnoticed for months. STVR republishes
      // each monthly Focus release in full text, and its tag page also carries AKO and
      // Ipsos, making it a general fallback rather than a Focus-only patch. Note the tag
      // page mixes agencies, which is what the agency guard in run.ts protects against.
      'https://spravy.stvr.sk/tag/prieskum/',
    ],
    // The old hub page (ipsos-dennik-n-prieskum-volebnych-preferencii, no suffix)
    // stopped linking new monthly articles after March 2026 even though Ipsos kept
    // publishing — each month gets its own dated article that nothing on the hub page
    // links to. The sitemap reliably lists every one.
    Ipsos: ['https://www.ipsos.com/sk-sk/sitemap.xml'],
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

  /**
   * Safety valve: a run that suddenly finds dozens of leads is a bug, not a windfall.
   * Raised from 12 when the STVR page was added: leads are collected agency by agency in
   * AGENT_AGENCIES order and the overflow is cut from the end, so a noisy early agency
   * starves a later one. The 2026-09-21 run already produced 11 leads (10 of them AKO),
   * which left Ipsos one slot from being dropped entirely before this source existed.
   * Triage returns at most 5 per list page, so 7 pages can yield 35 — this stays a valve
   * against a runaway bug without being reachable in normal operation.
   */
  maxLeadsPerRun: 20,

  /** Documents longer than this are reported, never silently truncated. */
  maxDocChars: 200_000,
} as const;
