import * as cheerio from "cheerio";
import type { FetchedDocument, FetchOptions } from "../types.ts";
import { PIPELINE_CONFIG } from "../config.ts";
import { fetchText, fetchBuffer, delay, shortFetchError } from "../fetch/shared.ts";

const PARLIAMENTARY_TITLE = "Volebné preferencie politických strán";
const REPORT_PATH_PREFIX = "/archiv/volebne-preferencie-politickych-stran-";
const MIN_YEAR = parseInt(PIPELINE_CONFIG.fieldworkStartMin.slice(0, 4), 10);

const FOCUS_SLUG_MONTH: Record<string, number> = {
  januar: 1, január: 1, january: 1,
  februar: 2, február: 2, february: 2,
  marec: 3, march: 3,
  april: 4, apríl: 4,
  maj: 5, may: 5,
  jun: 6, jún: 6, june: 6,
  jul: 7, júl: 7, july: 7,
  august: 8,
  september: 9,
  oktober: 10, október: 10, october: 10,
  november: 11,
  december: 12,
};

/** Parse YYYY-MM from Focus report URL slug (e.g. ...-november-2024/ or ...-11-2021/). */
function getMonthKeyFromFocusUrl(url: string): string | null {
  const path = url.split("?")[0];
  const slug = path.replace(/\/$/, "").split("/").pop() ?? "";
  const numMatch = slug.match(/-(\d{1,2})-(\d{4})(?:-|$)/);
  if (numMatch) {
    const month = parseInt(numMatch[1], 10);
    const year = numMatch[2];
    if (month >= 1 && month <= 12) return `${year}-${String(month).padStart(2, "0")}`;
  }
  const nameMatch = slug.match(/-([a-záíú]+)-(\d{4})(?:-|$)/i);
  if (nameMatch) {
    const key = nameMatch[1].toLowerCase().replace(/í/g, "i").replace(/ú/g, "u").replace(/á/g, "a");
    const month = FOCUS_SLUG_MONTH[key] ?? FOCUS_SLUG_MONTH[nameMatch[1].toLowerCase()];
    const year = nameMatch[2];
    if (month) return `${year}-${String(month).padStart(2, "0")}`;
  }
  return null;
}

function urlInDateRange(monthKey: string | null, options?: FetchOptions | null): boolean {
  if (!options || (!options.dateFrom && !options.dateTo)) return true;
  if (!monthKey) return true;
  if (options.dateFrom != null && options.dateFrom !== "" && monthKey < options.dateFrom.slice(0, 7)) return false;
  if (options.dateTo != null && options.dateTo !== "" && monthKey > options.dateTo.slice(0, 7)) return false;
  return true;
}

/**
 * Extract report page URLs from Focus press-centrum list.
 * Only items with title exactly "Volebné preferencie politických strán" (parliamentary; exclude presidential/NATO etc.).
 */
function extractReportUrls(html: string, baseUrl: string, options?: FetchOptions | null): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();

  $(".nectar-hor-list-item").each((_, el) => {
    const $item = $(el);
    const titleEl = $item.find(".nectar-list-item strong").first();
    const title = titleEl.text().trim();
    if (title !== PARLIAMENTARY_TITLE) return;

    const link = $item.find("a.full-link").attr("href");
    if (!link) return;
    try {
      const absolute = new URL(link, baseUrl).href;
      if (!absolute.includes(REPORT_PATH_PREFIX)) return;
      const yearMatch = absolute.match(/20\d{2}/);
      if (yearMatch && parseInt(yearMatch[0], 10) < MIN_YEAR) return;
      const monthKey = getMonthKeyFromFocusUrl(absolute);
      if (!urlInDateRange(monthKey, options)) return;
      if (!seen.has(absolute)) seen.add(absolute);
    } catch {
      // ignore invalid URLs
    }
  });

  return Array.from(seen);
}

/**
 * On a Focus report page, find PDF link ("Tlačová správa" / column-link to .pdf) or CSV ("Stiahnuť údaje").
 * Returns absolute URL or null.
 */
function extractPdfOrCsvUrl(html: string, baseUrl: string): { pdfUrl: string | null; csvUrl: string | null } {
  const $ = cheerio.load(html);
  let pdfUrl: string | null = null;
  let csvUrl: string | null = null;
  $('a[href]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href');
    if (!href) return;
    const text = $a.text().trim();
    const lower = href.toLowerCase();
    if (lower.endsWith('.pdf') && (text.includes('Tlačová') || text.includes('PDF') || $a.hasClass('column-link'))) {
      try {
        pdfUrl = new URL(href, baseUrl).href;
      } catch {}
    }
    if ((lower.endsWith('.csv') || lower.includes('csv')) && (text.includes('Stiahnuť') || text.includes('údaje'))) {
      try {
        csvUrl = new URL(href, baseUrl).href;
      } catch {}
    }
  });
  return { pdfUrl, csvUrl };
}

/**
 * Fetch Focus: load press-centrum list, collect "Volebné preferencie politických strán" report URLs,
 * then for each report page: prefer CSV from "Stiahnuť údaje" if present, else PDF from "Tlačová správa", else HTML.
 * When options.dateFrom/dateTo are set, only report URLs whose slug month is in that range are fetched.
 */
export async function fetchFocus(options?: FetchOptions | null): Promise<FetchedDocument[]> {
  const docs: FetchedDocument[] = [];
  const listUrl = PIPELINE_CONFIG.sources.Focus.listUrls[0];
  if (!listUrl) return docs;

  let listHtml: string;
  try {
    listHtml = await fetchText(listUrl);
  } catch (e) {
    console.warn(`Focus: failed to fetch list ${listUrl}: ${shortFetchError(e)}`);
    return docs;
  }
  await delay(PIPELINE_CONFIG.fetchDelayMs);

  const reportUrls = extractReportUrls(listHtml, listUrl, options);

  for (const reportUrl of reportUrls) {
    try {
      const reportHtml = await fetchText(reportUrl);
      await delay(PIPELINE_CONFIG.fetchDelayMs);

      const $ = cheerio.load(reportHtml);
      const hasTable = $('table').length > 0;
      const { pdfUrl, csvUrl } = extractPdfOrCsvUrl(reportHtml, reportUrl);

      if (csvUrl) {
        try {
          const csvText = await fetchText(csvUrl);
          await delay(PIPELINE_CONFIG.fetchDelayMs);
          docs.push({ url: reportUrl, html: csvText, sourceType: 'csv' });
          continue;
        } catch {
          // fall through
        }
      }

      if (!hasTable && pdfUrl) {
        try {
          const pdfBuffer = await fetchBuffer(pdfUrl);
          await delay(PIPELINE_CONFIG.fetchDelayMs);
          docs.push({ url: reportUrl, pdfBuffer, sourceType: 'pdf' });
        } catch (e) {
          console.warn(`Focus: failed to fetch PDF ${pdfUrl}: ${shortFetchError(e)}`);
          docs.push({ url: reportUrl, html: reportHtml, sourceType: 'html' });
        }
      } else {
        docs.push({ url: reportUrl, html: reportHtml, sourceType: 'html' });
      }
    } catch (e) {
      console.warn(`Focus: failed to fetch report ${reportUrl}: ${shortFetchError(e)}`);
    }
  }

  return docs;
}
