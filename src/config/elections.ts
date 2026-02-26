import type { ElectionConfig, PollsLoader } from '../data/types.ts'
import {
  loadElectionRulesFromJson,
  loadPartiesFromJson,
  loadPollsFromJson,
} from '../data/loaders/jsonLoader.ts'
import { loadPollsFromSheets } from '../data/loaders/sheetsLoader.ts'

export type ElectionKey = `${string}-${string}`

const jsonPollsLoader: PollsLoader = (countryId, electionId) =>
  loadPollsFromJson(countryId, electionId)

/** Create a polls loader that fetches from a published Google Sheet CSV URL. */
export function createSheetsPollsLoader(sheetUrl: string): PollsLoader {
  return (countryId, electionId) =>
    loadPollsFromSheets(sheetUrl, countryId, electionId)
}

/** Registry: (countryId, electionId) -> loader. Default is JSON from public/data/{countryId}/ */
const loaders = new Map<ElectionKey, PollsLoader>([
  ['sk-sk-2024', jsonPollsLoader],
])

/** Get polls loader for an election. Defaults to JSON loader. */
export function getPollsLoader(countryId: string, electionId: string): PollsLoader {
  const key: ElectionKey = `${countryId}-${electionId}` as ElectionKey
  return loaders.get(key) ?? jsonPollsLoader
}

/** Load full election config (rules + parties) for a country/election. */
export async function getElectionConfig(
  countryId: string,
  electionId: string
): Promise<ElectionConfig> {
  const [rules, parties] = await Promise.all([
    loadElectionRulesFromJson(countryId),
    loadPartiesFromJson(countryId),
  ])
  if (rules.electionId !== electionId) {
    throw new Error(`Election ${electionId} not found for country ${countryId}`)
  }
  return { rules, parties }
}

/** Default election for MVP (Slovakia 2024) */
export const DEFAULT_COUNTRY_ID = 'sk'
export const DEFAULT_ELECTION_ID = 'sk-2024'
