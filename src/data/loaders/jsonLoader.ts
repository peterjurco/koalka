import type { ElectionRules, Party, Poll } from '../types.ts'

/** Load polls from public/data/{countryId}/polls.json */
export async function loadPollsFromJson(
  countryId: string,
  electionId: string
): Promise<Poll[]> {
  const base = import.meta.env.BASE_URL ?? '/'
  const path = `${base}data/${countryId}/polls.json`
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to load polls: ${path}`)
  const data = (await res.json()) as Poll[]
  return data.filter((p) => p.countryId === countryId && p.electionId === electionId)
}

/** Load election rules from public/data/{countryId}/election.json */
export async function loadElectionRulesFromJson(countryId: string): Promise<ElectionRules> {
  const base = import.meta.env.BASE_URL ?? '/'
  const path = `${base}data/${countryId}/election.json`
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to load election: ${path}`)
  return res.json() as Promise<ElectionRules>
}

/** Load parties from public/data/{countryId}/parties.json */
export async function loadPartiesFromJson(countryId: string): Promise<Party[]> {
  const base = import.meta.env.BASE_URL ?? '/'
  const path = `${base}data/${countryId}/parties.json`
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Failed to load parties: ${path}`)
  return res.json() as Promise<Party[]>
}
