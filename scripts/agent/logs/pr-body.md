Automated poll watch run of 2026-08-31.

Watermarks at start: AKO 2026-07-14, Focus 2026-06-29, Ipsos 2026-06-23. Leads examined: 9.

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
- model notes: KSS and Spravodlivosť are printed with "-" in the August 2026 column (values only in the July 2026 column), so their August values are not reported and are omitted.

### AKO — https://ako.sk/wp-content/uploads/2025/07/ag.AKO_VOLEBNE-PREF-JUL-2025-tlacova-sprava.pdf

- `NÁRODNÁ KOALÍCIA/ NEZÁVISLÍ KANDIDÁTI` at 0.7% is not in parties.json — the poll was ingested without it.
- `Zdravý rozum` at 0.2% is not in parties.json — the poll was ingested without it.
- model notes: The confidence interval for "Zdravý rozum" is printed as "0,0 0,4" (missing dash); this does not affect the percentage value. Percentages listed are from the JÚL 2025 column (the announced poll); the JÚN 2025 trend column was ignored.
- skipped: not newer than the watermark (2025-07-15 <= 2026-07-14)

### AKO — https://ako.sk/wp-content/uploads/2025/06/ag.AKO_VOLEBNE-PREF-JUN-2025-tlacova-sprava-.pdf

- `Pirátska strana – Slovensko` at 0.3% is not in parties.json — the poll was ingested without it.
- `Komunistická strana Slovenska (KSS)` at 0.3% is not in parties.json — the poll was ingested without it.
- `MOST–HÍD 2023` at 0.1% is not in parties.json — the poll was ingested without it.
- `Národná koalícia/Nezávislí kandidáti` at 0.1% is not in parties.json — the poll was ingested without it.
- `SLOVENSKO` = 8 could not be found in the source text (value 8 not found near "SLOVENSKO" in source text). Verify against the PDF before merging.
- skipped: not newer than the watermark (2025-06-19 <= 2026-07-14)

### AKO — https://ako.sk/wp-content/uploads/2025/06/ag.AKO_VOLEBNE-PREF-MAJ-2025-tlacova-sprava.pdf

- `NÁRODNÁ KOALÍCIA/ NEZÁVISLÍ KANDIDÁTI` at 0.7% is not in parties.json — the poll was ingested without it.
- `Komunistická strana Slovenska (KSS)` at 0.2% is not in parties.json — the poll was ingested without it.
- `ZDRAVÝ ROZUM` at 0.2% is not in parties.json — the poll was ingested without it.
- skipped: not newer than the watermark (2025-05-26 <= 2026-07-14)

### AKO — https://ako.sk/wp-content/uploads/2025/04/ag.AKO_VOLEBNE-PREF-APRIL-2025-tlacova-sprava.pdf

- `NÁRODNÁ KOALÍCIA/ NEZÁVISLÍ KANDIDÁTI` at 0.3% is not in parties.json — the poll was ingested without it.
- `Komunistická strana Slovenska (KSS)` at 0.3% is not in parties.json — the poll was ingested without it.
- `Kresťanská únia` at 0.2% is not in parties.json — the poll was ingested without it.
- `ZDRAVÝ ROZUM` at 0.2% is not in parties.json — the poll was ingested without it.
- model notes: The label "NÁRODNÁ KOALÍCIA/ NEZÁVISLÍ KANDIDÁTI" is printed split across two lines in the document.
- skipped: not newer than the watermark (2025-04-17 <= 2026-07-14)

### AKO — https://ako.sk/wp-content/uploads/2025/02/ag.AKO_VOLEBNE-PREF-FEBRUAR-2025-tlacova-sprava.pdf

- `NÁRODNÁ KOALÍCIA/ NEZÁVISLÍ KANDIDÁTI` at 0.5% is not in parties.json — the poll was ingested without it.
- `Komunistická strana Slovenska (KSS)` at 0.5% is not in parties.json — the poll was ingested without it.
- `ZDRAVÝ ROZUM` at 0.3% is not in parties.json — the poll was ingested without it.
- `SLOVENSKO` = 6 could not be found in the source text (value 6 not found near "SLOVENSKO" in source text). Verify against the PDF before merging.
- model notes: Values taken from the FEBRUÁR 2025 column (the announced poll); a JANUÁR 2025 column is also printed. The label "NÁRODNÁ KOALÍCIA/ NEZÁVISLÍ KANDIDÁTI" is split across two lines in the document. Kotlebovci – ĽSNS is printed as "0.3%" with a decimal point instead of a comma. Mandate counts are not printed for Demokrati and SNS rows.
- skipped: not newer than the watermark (2025-02-12 <= 2026-07-14)

### AKO — https://joj24.noviny.sk/prieskumy/1251886-volebny-prieskum-joj-24-republika-je-uz-tretia-sns-aj-demokrati-mimo-parlamentu

- failed: HTTP 404: https://www.iabslovakia.sk/wp-content/uploads/2018/09/IAB_Slovakia_Kodex_spracuvania_osobnych_udajov_2018.pdf

### Focus — https://www.focus-research.sk/archiv/volebne-preferencie-politickych-stran-jun-2026/

- `Konzervatívci - Kresťanská únia` at 0.1% is not in parties.json — the poll was ingested without it.
- `iná strana` at 1.4% is not in parties.json — the poll was ingested without it.
- model notes: The table has two percentage columns (jún 2026 and máj 2026); values transcribed from the jún 2026 column. 13,3% would not vote, 13,4% answered "neviem", 73,3% were decided respondents.
- skipped: not newer than the watermark (2026-06-29 <= 2026-06-29)

### Ipsos — https://www.ipsos.com/sk-sk/ipsos-dennik-n-prieskum-volebnych-preferencii-august-2026

- `Iné strany` at 2.1% is not in parties.json — the poll was ingested without it.
- `results.smer`: extracted `17.9`, aggregator says `18.1`.
- `results.ps`: extracted `18.1`, aggregator says `17.9`.
- model notes: Kotlebovci – ĽS Naše Slovensko has "-" printed in the August 2026 column (no value), so its row is omitted. The release notes that the exact printed 8,2 % values correspond to Hlas 8,189 % and SaS 8,188 %; the table values as printed (8,2 %) were copied.


---

@peterjurco please review before merging. Values were extracted by a model and checked against the source text; the full run report is committed alongside this change under `scripts/agent/logs/`.