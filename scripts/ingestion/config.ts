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
    Ipsos: {
      /**
       * Ipsos.com pages that contain PDF links.
       * Hub page: 6 most recent PDFs (rolling).
       * Archive article: 12 PDFs covering May 2023 – Feb 2024.
       */
      listUrls: [
        "https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii",
        "https://www.ipsos.com/sk-sk/februar-2024-volebny-model-volebne-preferencie-slovakov",
      ],
      /**
       * Direct PDF URLs for gap months (Mar 2024 – Aug 2025) that have no article page.
       * These are the only ones publicly accessible for this period.
       * Missing: Mar–Apr 2024, Aug–Dec 2024, Feb 2025, Apr 2025, Jun–Aug 2025.
       */
      directPdfUrls: [
        // Jul 2024 fieldwork (Jun 26–Jul 1)
        "https://www.ipsos.com/sites/default/files/ct/news/documents/2024-07/IPSOS%20-%20Tla%C4%8Dov%C3%A1%20spr%C3%A1va%20-%20Reprezentat%C3%ADvny%20prieskum%20politick%C3%BDch%20preferenci%C3%AD%202.7.%202024.pdf",
        // Jan 2025 fieldwork
        "https://www.ipsos.com/sites/default/files/ct/news/documents/2025-01/IPSOS%20-%20Tla%C4%8Dov%C3%A1%20spr%C3%A1va%20-%20Reprezentat%C3%ADvny%20prieskum%20politick%C3%BDch%20preferenci%C3%AD%2020.1.2025%20(002).pdf",
        // Mar 2025 fieldwork
        "https://www.ipsos.com/sites/default/files/ct/news/documents/2025-03/IPSOS%20-%20Tla%C4%8Dov%C3%A1%20spr%C3%A1va%20-%20Reprezentat%C3%ADvny%20prieskum%20politick%C3%BDch%20preferenci%C3%AD%2016.3.2025.pdf",
        // May 2025 fieldwork
        "https://www.ipsos.com/sites/default/files/ct/news/documents/2025-05/IPSOS%20-%20Tla%C4%8Dov%C3%A1%20spr%C3%A1va%20-%20Reprezentat%C3%ADvny%20prieskum%20politick%C3%BDch%20preferenci%C3%AD%2019.%205.%202025.pdf",
      ],
    },
    Focus: {
      /** Focus press centrum: list of "Volebné preferencie politických strán" is scraped from here; report pages are fetched from links. */
      listUrls: ["https://www.focus-research.sk/press-centrum/"],
    },
  },
} as const;

export type PipelineConfig = typeof PIPELINE_CONFIG;
