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
    const at = doc.indexOf(needle);

    if (at < 0) {
      return {
        party,
        value: percent,
        grounded: false,
        reason: 'party name not found in source text',
      };
    }

    const slice = doc.slice(
      Math.max(0, at - window),
      at + needle.length + window,
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
