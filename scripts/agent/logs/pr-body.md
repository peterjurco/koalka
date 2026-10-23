Automated poll watch run of 2026-10-23.

Watermarks at start: AKO 2026-09-21, Focus 2026-09-07, Ipsos 2026-09-22. Leads examined: 13.

## Added

- **sk-focus-2026-10** — Focus, fieldwork 2026-10-12 to 2026-10-19, n=1017
  - source: https://www.focus-research.sk/archiv/volebne-preferencie-politickych-stran-oktober-2026/
  - found via: site
- **sk-ipsos-2026-10** — Ipsos, fieldwork 2026-10-15 to 2026-10-19, n=1032
  - source: https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii-oktober-2026
  - found via: site

## Needs your attention

### AKO — https://joj24.noviny.sk/prieskumy

- skipped: document never names AKO — most likely another agency's poll on a shared page

### Focus — https://www.focus-research.sk/archiv/volebne-preferencie-politickych-stran-oktober-2026/

- `Konzervatívci - Kresťanská únia` at 0.3% is not in parties.json — the poll was ingested without it.
- `iná strana` at 0.3% is not in parties.json — the poll was ingested without it.
- model notes: The rows 'Konzervatívci - Kresťanská únia' and 'iná strana' print no 95% confidence interval, only '0,3% - 0,4%'; read as October 2026 = 0,3% and September 2026 = 0,4%, consistent with the other rows' column order. The trend column for september 2026 was ignored as instructed.

### Ipsos — https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii-oktober-2026

- `Iné strany` at 2.2% is not in parties.json — the poll was ingested without it.
- model notes: Party label "*Sme rodina" is printed with an asterisk referring to a footnote: in September 2026 the party was presented to respondents as "Sme rodina a Sulíkovci", while in August and October it was listed as "Sme rodina".


---

@peterjurco please review before merging. Values were extracted by a model and checked against the source text; the full run report is committed alongside this change under `scripts/agent/logs/`.