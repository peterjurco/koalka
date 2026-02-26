import type { FetchedDocument } from '../types.ts';
import { PIPELINE_CONFIG } from '../config.ts';
import { fetchText, delay, shortFetchError } from '../fetch/shared.ts';

/**
 * Fetch Ipsos/Denník N list page(s). Returns HTML for parser.
 */
export async function fetchIpsos(): Promise<FetchedDocument[]> {
  const docs: FetchedDocument[] = [];
  for (const listUrl of PIPELINE_CONFIG.sources.Ipsos.listUrls) {
    try {
      const html = await fetchText(listUrl);
      docs.push({ url: listUrl, html });
    } catch (e) {
      console.warn(`Ipsos: failed to fetch ${listUrl}: ${shortFetchError(e)}`);
    }
    await delay(PIPELINE_CONFIG.fetchDelayMs);
  }
  return docs;
}
