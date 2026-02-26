import { PIPELINE_CONFIG } from '../config.ts';

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** One-line summary for fetch errors (avoids dumping TLS/cert stacks). */
export function shortFetchError(e: unknown): string {
  if (e instanceof Error) {
    const cause = e.cause instanceof Error ? e.cause : null;
    const code = cause && 'code' in cause ? String(cause.code) : null;
    if (code) return `${e.message} (${code})`;
    if (cause) return cause.message;
    return e.message;
  }
  return String(e);
}

export async function fetchWithDelay(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': PIPELINE_CONFIG.userAgent,
      ...(options.headers as Record<string, string>),
    },
  });
  await delay(PIPELINE_CONFIG.fetchDelayMs);
  return res;
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetchWithDelay(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

export async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetchWithDelay(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.arrayBuffer();
}
