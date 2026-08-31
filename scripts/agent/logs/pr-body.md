Automated poll watch run of 2026-08-31.

Watermarks at start: AKO 2026-07-14, Focus 2026-06-29, Ipsos 2026-06-23. Leads examined: 6.

## Added

- **sk-ako-2026-08** — AKO, fieldwork 2026-08-06 to 2026-08-14, n=1000
  - source: https://ako.sk/wp-content/uploads/2026/08/ag.AKO_VOLEBNE-PREF-AUGUST-2026-tlacova-sprava-003.pdf
  - found via: site
- **sk-ipsos-2026-08** — Ipsos, fieldwork 2026-08-18 to 2026-08-23, n=1061
  - source: https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii-august-2026
  - found via: site

## Needs your attention

### AKO — https://ako.sk/wp-content/uploads/2026/08/ag.AKO_VOLEBNE-PREF-AUGUST-2026-tlacova-sprava-003.pdf

- `Právo na pravdu (PRAVDA)` at 2.9% is not in parties.json — the poll was ingested without it.
- `Konzervatívci – Kresťanská únia` at 0.3% is not in parties.json — the poll was ingested without it.
- `Pirátska strana - Slovensko` at 0.2% is not in parties.json — the poll was ingested without it.
- model notes: KSS and Spravodlivosť are listed with "-" in the August 2026 column (values only printed for July 2026), so their August figures are omitted.

### Ipsos — https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii-august-2026

- `Iné strany` at 2.1% is not in parties.json — the poll was ingested without it.
- `results.smer`: extracted `17.9`, aggregator says `18.1`.
- `results.ps`: extracted `18.1`, aggregator says `17.9`.
- model notes: Kotlebovci – ĽS Naše Slovensko has "-" printed for the August 2026 column, so no value was recorded. The release notes that the exact printed 8,2 % values correspond to Hlas 8,189 % and SaS 8,188 %; the table values were copied as printed.


---

@peterjurco please review before merging. Values were extracted by a model and checked against the source text; the full run report is committed alongside this change under `scripts/agent/logs/`.