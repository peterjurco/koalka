/**
 * Pipeline config: election, date range, per-agency source URLs.
 * Change URLs here when sources move; parsers stay unchanged.
 */
export const PIPELINE_CONFIG = {
  countryId: "sk" as const,
  electionId: "sk-2024",
  /** Inclusive start (YYYY-MM-DD) */
  fieldworkStartMin: "2020-01-01",
  /** Inclusive end: today at run time */
  get fieldworkEndMax(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  },

  /**
   * Verified/processed data cutoff (YYYY-MM-DD). Polls in existing polls.json with
   * fieldworkEnd <= this date are never overwritten by a new ingest run.
   * Set to undefined to allow full overwrite; set e.g. "2024-12-31" once you have
   * checked data up to that date.
   */
  processedDataUntil: "2026-01-25",

  /** Delay in ms between HTTP requests (rate limiting) */
  fetchDelayMs: 500,

  /** User-Agent for fetch (optional) */
  userAgent: "KoalkaIngestion/1.0 (Slovak polls archive)",

  /**
   * Per-agency: list or archive URLs to fetch. Parser extracts poll data from these pages (and, for AKO, from PDFs linked there).
   * Use pages that either contain the poll table directly or link to PDFs/poll pages. See scripts/ingestion/README.md for what to put here.
   */
  sources: {
    AKO: {
      /** AKO archive: lists PDFs of monthly volebné preferencie (e.g. ako.sk/wp-content/uploads/.../ag.AKO_VOLEBNE_PREF_*.pdf) */
      listUrls: [
        "https://ako.sk/",
        "https://ako.sk/o-agenture/tlacove-spravy/",
        "https://ako.sk/referencie/prieskumy-volebnych-preferencii/",
      ],
    },
    NMS: {
      /** NMS Market Research (nms-mr.com): add blog/news URL if they publish polls; or leave empty / add media URLs that republish NMS with full table + sample size */
      listUrls: ["https://www.nms-mr.com/"],
    },
    Ipsos: {
      /** Denník N: add URLs of articles that contain Ipsos poll tables (full results + sample size). E.g. search "Ipsos prieskum" on dennikn.sk and add article URLs. */
      listUrls: ["https://dennikn.sk/minuta/3591461"],
    },
    Focus: {
      /** Focus press centrum: list of "Volebné preferencie politických strán" is scraped from here; report pages are fetched from links. */
      listUrls: ["https://www.focus-research.sk/press-centrum/"],
    },
  },
} as const;

export type PipelineConfig = typeof PIPELINE_CONFIG;
