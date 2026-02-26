import type { Poll, VoteShare } from '../types.ts'

/**
 * Load polls from a published Google Sheet (CSV).
 * Publish the sheet via File > Share > Publish to web > CSV.
 * Sheet columns: id, countryId, electionId, agency, fieldworkStart, fieldworkEnd, [partyId columns...]
 * Party columns hold percentage numbers.
 */
export async function loadPollsFromSheets(
  sheetUrl: string,
  countryId: string,
  electionId: string
): Promise<Poll[]> {
  const res = await fetch(sheetUrl)
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`)
  const text = await res.text()
  return parsePollsCsv(text, countryId, electionId)
}

function parsePollsCsv(
  csv: string,
  countryId: string,
  electionId: string
): Poll[] {
  const lines = csv.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0]!)
  const partyCols = headers.filter(
    (h) =>
      !['id', 'countryId', 'electionId', 'agency', 'fieldworkStart', 'fieldworkEnd', 'sourceUrl'].includes(h)
  )

  const polls: Poll[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!)
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      row[h] = values[j] ?? ''
    })
    if (row['countryId'] !== countryId || row['electionId'] !== electionId) continue

    const results: VoteShare = {}
    for (const col of partyCols) {
      const v = parseFloat(row[col] ?? '')
      if (!Number.isNaN(v)) results[col] = v
    }

    polls.push({
      id: row['id'] || `sheet-${i}`,
      countryId: row['countryId'] ?? countryId,
      electionId: row['electionId'] ?? electionId,
      agency: row['agency'] ?? '',
      fieldworkStart: row['fieldworkStart'] ?? '',
      fieldworkEnd: row['fieldworkEnd'] ?? '',
      sourceUrl: row['sourceUrl'] || undefined,
      results,
    })
  }
  return polls
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
    } else if ((c === ',' && !inQuotes) || c === '\r') {
      out.push(cur.trim())
      cur = ''
    } else if (c !== '\r') {
      cur += c
    }
  }
  out.push(cur.trim())
  return out
}
