import { AGENT_CONFIG } from './config.ts';
import type { ExtractedResult, GroundingResult } from './types.ts';

/**
 * Lowercase, strip diacritics, normalize whitespace — so PDF line breaks don't matter.
 *
 * Deviation from the plan: normalizes each whitespace character individually
 * (`/\s/g`) rather than collapsing runs (`/\s+/g`). Collapsing runs erases how far
 * apart things are in the source before the grounding window ever gets to check —
 * a run of blank lines between unrelated table sections would fold down to a single
 * space and look adjacent, defeating the window guard entirely. Normalizing char-by-char
 * keeps a single line break turning into a single space (so a party name split across
 * one line break still matches) while preserving the distance a multi-character gap
 * represents.
 */
function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s/g, ' ');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Max whitespace characters allowed to bridge two words of a party name in the search
 * regex below. Must comfortably cover realistic PDF-extraction artifacts — a line wrap,
 * a blank line, or a couple of stacked blank lines with ragged table padding — while
 * staying far short of a gap that could plausibly separate two unrelated mentions in a
 * document (e.g. a page break or the space between sections, which run to hundreds of
 * characters). 24 covers roughly six blank lines' worth of `\n`, well beyond anything a
 * single wrapped/padded name should produce, with a wide margin under real cross-section
 * gaps.
 */
const MAX_NAME_WORD_GAP = 24;

/** Every way an agency might print this number: 17.8, 17,8, and for integers also 8,0. */
function numberVariants(value: number): string[] {
  const plain = String(value);
  const oneDecimal = value.toFixed(1);
  return [
    ...new Set([
      plain,
      plain.replace('.', ','),
      oneDecimal,
      oneDecimal.replace('.', ','),
    ]),
  ];
}

/**
 * True when `value` occurs in `text` as a whole number token — not as part of a longer
 * one. "1017,8" must not ground 17.8, and "80" must not ground 8.
 */
export function numberAppears(text: string, value: number): boolean {
  return numberVariants(value).some((variant) =>
    new RegExp(`(?<![\\d.,])${escapeRegExp(variant)}(?![\\d.,]*\\d)`).test(text),
  );
}

/**
 * For each extracted party result, check the number actually appears in the source text
 * within `window` characters of the party's name. A failure is a flag for the PR, never
 * a block: some agencies publish values only inside chart images.
 */
export function checkGrounding(
  docText: string,
  results: readonly ExtractedResult[],
  window: number = AGENT_CONFIG.groundingWindow,
): GroundingResult[] {
  const doc = fold(docText);

  return results.map(({ party, percent }) => {
    const needle = fold(party);
    // `doc.indexOf(needle)` would require exact whitespace equality between the
    // party name and its occurrence in the document. But `fold()` deliberately no
    // longer collapses whitespace runs (see its docstring), so a party name split
    // across a run of whitespace in the source — a blank line or ragged column
    // padding inside a PDF-extracted table — won't match as an exact substring even
    // though it's the same name. Search with a regex instead: split the (already
    // folded) name on whitespace and let a *bounded* run of whitespace in the
    // document bridge the words (see MAX_NAME_WORD_GAP). Bounding it matters: an
    // unbounded `\s+` here previously let two words from two unrelated mentions,
    // separated by an arbitrarily long blank-line run, get treated as one match —
    // silently grounding a value that belongs to different text entirely. This keeps
    // the whitespace tolerance scoped to name matching only — the window check below
    // still uses true character distance from the actual matched span, not the
    // original needle's length.
    const words = needle.split(' ').filter((word) => word.length > 0);
    const pattern = words.map(escapeRegExp).join(`\\s{1,${MAX_NAME_WORD_GAP}}`);
    const match = pattern.length > 0 ? new RegExp(pattern).exec(doc) : null;

    if (!match) {
      return {
        party,
        value: percent,
        grounded: false,
        reason: 'party name not found in source text',
      };
    }

    const at = match.index;
    const slice = doc.slice(
      Math.max(0, at - window),
      at + match[0].length + window,
    );

    return numberAppears(slice, percent)
      ? { party, value: percent, grounded: true, reason: '' }
      : {
          party,
          value: percent,
          grounded: false,
          reason: `value ${percent} not found near "${party}" in source text`,
        };
  });
}
