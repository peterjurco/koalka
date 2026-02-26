import type { FetchedDocument } from '../types.ts';
import { PIPELINE_CONFIG } from '../config.ts';
import { fetchText, delay, shortFetchError } from '../fetch/shared.ts';

/**
 * Fetch NMS blog/category list page(s). Returns HTML for parser.
 */
export async function fetchNMS(): Promise<FetchedDocument[]> {
  const docs: FetchedDocument[] = [];
  for (const listUrl of PIPELINE_CONFIG.sources.NMS.listUrls) {
    try {
      const html = await fetchText(listUrl);
      docs.push({ url: listUrl, html });
    } catch (e) {
      console.warn(`NMS: failed to fetch ${listUrl}: ${shortFetchError(e)}`);
    }
    await delay(PIPELINE_CONFIG.fetchDelayMs);
  }
  return docs;
}
