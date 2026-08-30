import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PartyId } from "../../../src/data/types.ts";

interface PartyEntry {
  id: string;
  name: string;
  shortName: string;
  abbr?: string;
}

const PARTIES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../public/data/sk/parties.json",
);

const PARTIES = JSON.parse(readFileSync(PARTIES_PATH, "utf-8")) as PartyEntry[];

/**
 * Canonical party slugs, derived from public/data/sk/parties.json so this list can
 * never drift from the data the app actually renders.
 */
export const CANONICAL_PARTY_SLUGS: PartyId[] = PARTIES.map((p) => p.id);

/**
 * Normalize a string for matching: lowercase, replace spaces/dashes with underscore,
 * strip diacritics (optional).
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_")
    .replace(/[–—]/g, "_")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9_]/g, "");
}

/** Alias (normalized form) → canonical slug */
const aliasToSlug = new Map<string, PartyId>();

function add(slug: PartyId, ...aliases: string[]): void {
  aliasToSlug.set(slug, slug);
  aliasToSlug.set(normalizeForMatch(slug), slug);
  for (const a of aliases) {
    aliasToSlug.set(normalizeForMatch(a), slug);
  }
}

// Every party's own id, name, shortName and abbr resolve to itself. Hand-curated
// aliases below are registered afterwards and take precedence on collision.
for (const p of PARTIES) {
  const names = [p.name, p.shortName, ...(p.abbr != null ? [p.abbr] : [])];
  add(p.id as PartyId, ...names);
}

add(
  "smer",
  "smer_ssd",
  "smer_ss",
  "smer_sd",
  "smer_sssd",
  "SMER-SSD",
  "SMER – SD",
  "Smer-SD",
  "SMER-SD",
  "SMER-Sociálna demokracia",
  "SMER - sociálna demokracia",
  "SMER – slovenská sociálna demokracia",
);
add(
  "ps",
  "progresívne slovensko",
  "progresivne slovensko",
  "progresívne",
  "PS",
);
add(
  "hlas",
  "hlas_sd",
  "HLAS-SD",
  "HLAS",
  "Hlas",
  "HLAS - sociálna demokracia",
  "HLAS – SD",
);
add(
  "sns",
  "slovenská národná strana",
  "slovenska narodna strana",
  "SNS",
  "SNS (Slovenská národná strana)",
);
add(
  "sas",
  "sloboda a solidarita",
  "SaS",
  "SAS",
  "SaS (Sloboda a solidarita)",
  "SaS (Sloboda a Solidarita)",
);
add(
  "kdh",
  "kresťanskodemokratické hnutie",
  "krestanskodemokraticke hnutie",
  "KDH",
  "KDH (Kresťanskodemokratické hnutie)",
);
add(
  "olano",
  "oľano",
  "olano",
  "obyčajní ľudia",
  "obycajni ludia",
  "OĽaNO",
  "OLano",
  "OĽANO",
  "OBYČAJNÍ ĽUDIA",
  "OBYČAJNÍ ĽUDIA a nezávislé osobnosti, Nova, Kresťanská únia, Zmena zdola",
  "OĽANO-NOVA-KÚ-ZMENA ZDOLA",
  "OBYČAJNÍ ĽUDIA a nezávislé osobnosti - OĽANO",
  "Hnutie Slovensko",
  // AKO July 2023-style: long name can wrap; continuation line contains NEKA, NOVA, Za ľudí
  "kandidáti (NEKA), NOVA, Slobodní a zodpovední, Pačivale Roma, Magyar Szívek a Kresťanská únia a Za ľudí",
  "OĽaNO a priatelia: Obyčajní ľudia (OĽANO), Nezavíslí kandidáti (NEKA), NOVA, Slobodní a zodpovední, Pačivale Roma, Magyar Szívek a Kresťanská únia a Za ľudí",
  // AKO June 2023
  "OBYČAJNÍ ĽUDIA a NEZÁVISLÍ KANDIDÁTI a NOVA a SLOBODNÍ A ZODPOVEDNÍ a PAČIVALE ROMA a MAGYAR SZÍVEK",
  // AKO November 2023 (name on two lines; % on second)
  "Koalícia SLOVENSKO, Kresťanská únia a Za ľudí",
  // AKO January 2024 etc. (name on two lines; % on first line, so we only see first part)
  "Koalícia SLOVENSKO, Kresťanská únia",
  "Koalícia Slovensko, KÚ a ZĽ",
  "SLOVENSKO",
);
add("republika", "REPUBLIKA", "REP");
add(
  "lsns",
  "Kotlebovci - Ľudová strana Naše Slovensko",
  "Kotlebovci – ĽS Naše Slovensko",
  "Kotlebovci",
  "ĽSNS",
  "Kotlebovci - ĽSNS",
  "Kotlebovci - Ľudová strana Naše",
);
add("sme_rodina", "sme rodina", "SR", "Sme Rodina", "SME RODINA");
add("demokrati", "Demokrati", "DEM");
add(
  "madarska_aliancia",
  "Maďarská aliancia",
  "madarska aliancia",
  "Aliancia – Szövetség",
  "Aliancia - Szövetség",
  "Aliancia – Szövetség3",
  "Regiók /Aliancia - Maďari. Národnosti.",
  "Regiók /Aliancia - Maďari. Národnosti. Regióny",
  "Magyar Szövetség - Maďarská aliancia",
  "Magyar Szövetség – Maďarská aliancia",
  "Magyar Szövetseg - Madarska aliancia",
  "Maďarská aliancia – Magyar Szövetség",
  "Szövetség",
  "Szövetség – ALIANCIA",
  "MA",
  // AKO November 2023: three-line label, number in the middle or at end of second line
  "Szövetség - Magyarok. Nemzetiségek. Regiók /Aliancia - Maďari. Národnosti. Regióny",
  "Szövetség - Magyarok. Nemzetiségek.",
  "Szövetség - Magyarok. Nemzetiségek. Regiók /Aliancia - Maďari. Národnosti.",
  "Regióny", // last line of the three-line block when % is on same line
  "/Aliancia - Maďari. Národnosti. Regióny", // AKO Aug 2023: second line when break is after "Regiók"
);
add(
  "za_ludi",
  "Za ľudí",
  "za ludi",
  "ZA ĽUDÍ",
  "ZA LUDI",
  "Za ludi",
  "ZĽ",
  "ZL",
  "Za ľudi",
  "Za ludí",
);

/** Strip leading numbers (e.g. "3 Progresívne Slovensko" → "Progresívne Slovensko"). */
function stripLeadingNumber(s: string): string {
  return s.replace(/^\s*\d+\s*\.?\s*/, "").trim();
}

/**
 * Resolve a raw party name or label to canonical party slug.
 * Returns the slug or null if no mapping (caller may use 'other' or skip).
 * Leading numbers in the name (e.g. "3 Progresívne Slovensko") are ignored for matching.
 * Names containing "OLANO" or "OĽANO" (any suffix/prefix) map to olano even when not in the alias list.
 */
export function resolvePartySlug(raw: string): PartyId | null {
  const key = normalizeForMatch(raw);
  let slug = aliasToSlug.get(key) ?? null;
  const stripped = stripLeadingNumber(raw);
  const keyStripped = stripped !== raw ? normalizeForMatch(stripped) : null;
  if (slug == null && keyStripped != null)
    slug = aliasToSlug.get(keyStripped) ?? null;
  if (
    slug == null &&
    (key.includes("olano") ||
      (keyStripped != null && keyStripped.includes("olano")))
  ) {
    slug = "olano";
  }
  return slug;
}

/**
 * Map raw results (party name → %) to canonical slug → %.
 * Unknown parties are collected; caller can add to alias map or use 'other'.
 * Here we only map known parties and drop unmapped (or could aggregate to 'other').
 */
export function mapResultsToSlugs(results: Record<string, number>): {
  results: Record<PartyId, number>;
  unmapped: string[];
} {
  const out: Record<PartyId, number> = {};
  const unmapped: string[] = [];
  for (const [name, pct] of Object.entries(results)) {
    const slug = resolvePartySlug(name);
    if (slug != null) {
      out[slug] = (out[slug] ?? 0) + pct;
    } else {
      unmapped.push(name);
    }
  }
  return { results: out, unmapped };
}
