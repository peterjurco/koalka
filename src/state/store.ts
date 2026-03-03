import { create } from 'zustand'
import type { ElectionConfig, PartyId, Poll, VoteShare } from '../data/types.ts'
import type { MonthlyAggregate, TrendValueSource } from '../core/aggregation/index.ts'
import type { CoalitionResult } from '../core/coalition/index.ts'
import type { SeatAllocation } from '../core/allocation/index.ts'
import { getElectionConfig, getPollsLoader, DEFAULT_COUNTRY_ID, DEFAULT_ELECTION_ID } from '../config/elections.ts'
import { aggregatePollsByMonth } from '../core/aggregation/index.ts'
import { allocateSeats } from '../core/allocation/index.ts'
import { buildCoalition } from '../core/coalition/index.ts'
import { parseISODate, getMonthKey } from '../utils/index.ts'
import { getFiltersFromUrl } from '../utils/urlFilters.ts'

export type VoteSource =
  | { type: 'poll'; pollId: string }
  | { type: 'monthly'; monthKey: string }

export interface PollFilters {
  agency: string | null
  dateFrom: string
  dateTo: string
}

export interface KoalkaState {
  countryId: string
  electionId: string
  config: ElectionConfig | null
  polls: Poll[]
  /** Toolbar filters (agency, date range) */
  filters: PollFilters
  /** Polls after applying filters; used by charts and aggregates */
  filteredPolls: Poll[]
  monthlyAggregates: MonthlyAggregate[]
  /** Monthly aggregates from filteredPolls (percent or mandates per trendValueMode) */
  filteredMonthlyAggregates: MonthlyAggregate[]
  /** Trend chart: show percent or mandates */
  trendValueMode: TrendValueSource
  /** Current vote source for seat calc and coalition */
  voteSource: VoteSource | null
  /** Seat allocation for current vote source */
  seatAllocation: SeatAllocation | null
  /** Selected party IDs for coalition builder */
  selectedCoalitionPartyIds: PartyId[]
  /** Coalition result for current selection and vote source */
  coalitionResult: CoalitionResult | null
  loading: boolean
  error: string | null
}

export interface KoalkaActions {
  setElection: (countryId: string, electionId: string) => Promise<void>
  setFilters: (partial: Partial<PollFilters>) => void
  setTrendValueMode: (mode: TrendValueSource) => void
  setVoteSource: (source: VoteSource | null) => void
  setSelectedCoalitionPartyIds: (ids: PartyId[]) => void
  toggleCoalitionParty: (partyId: PartyId) => void
  loadPolls: () => Promise<void>
}

function getMonthsFromPolls(polls: Poll[]): string[] {
  const set = new Set<string>()
  for (const p of polls) {
    set.add(getMonthKey(parseISODate(p.fieldworkStart)))
    set.add(getMonthKey(parseISODate(p.fieldworkEnd)))
  }
  return Array.from(set).sort()
}

function applyFilters(polls: Poll[], filters: PollFilters): Poll[] {
  return polls.filter((p) => {
    if (filters.agency != null && filters.agency !== '' && p.agency !== filters.agency) return false
    const month = getMonthKey(parseISODate(p.fieldworkEnd))
    if (month < filters.dateFrom || month > filters.dateTo) return false
    return true
  })
}

function getVoteShare(state: KoalkaState): VoteShare | null {
  if (!state.config) return null
  const src = state.voteSource
  if (src?.type === 'poll') {
    const poll = state.polls.find((p) => p.id === src.pollId)
    return poll?.results ?? null
  }
  if (src?.type === 'monthly') {
    const agg = state.monthlyAggregates.find((a) => a.monthKey === src.monthKey)
    return agg?.results ?? null
  }
  return null
}

const emptyFilters: PollFilters = { agency: null, dateFrom: '', dateTo: '' }

export const useStore = create<KoalkaState & KoalkaActions>((set, get) => ({
  countryId: DEFAULT_COUNTRY_ID,
  electionId: DEFAULT_ELECTION_ID,
  config: null,
  polls: [],
  filters: emptyFilters,
  filteredPolls: [],
  monthlyAggregates: [],
  filteredMonthlyAggregates: [],
  trendValueMode: 'results',
  voteSource: null,
  seatAllocation: null,
  selectedCoalitionPartyIds: [],
  coalitionResult: null,
  loading: false,
  error: null,

  setElection: async (countryId, electionId) => {
    set({ countryId, electionId, loading: true, error: null })
    try {
      const config = await getElectionConfig(countryId, electionId)
      set({ config })
      const loader = getPollsLoader(countryId, electionId)
      const polls = await loader(countryId, electionId)
      const months = getMonthsFromPolls(polls)
      const validAgencies = [...new Set(polls.map((p) => p.agency))]
      const filters = getFiltersFromUrl(months, validAgencies)
      const filteredPolls = applyFilters(polls, filters)
      const mode = get().trendValueMode
      const monthlyAggregates = aggregatePollsByMonth(polls, mode)
      const filteredMonthlyAggregates = aggregatePollsByMonth(filteredPolls, mode)
      set({ polls, filters, filteredPolls, monthlyAggregates, filteredMonthlyAggregates })
      set({ voteSource: null, seatAllocation: null, coalitionResult: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Nepodarilo sa načítať voľby' })
    } finally {
      set({ loading: false })
    }
  },

  setFilters: (partial) => {
    const state = get()
    let filters = { ...state.filters, ...partial }
    let filteredPolls = applyFilters(state.polls, filters)
    // If no polls match (e.g. date range excludes all polls for selected agency), adjust date range to that agency's range
    if (filteredPolls.length === 0 && (partial.agency != null || partial.dateFrom != null || partial.dateTo != null)) {
      const agencyPolls =
        filters.agency != null && filters.agency !== ''
          ? state.polls.filter((p) => p.agency === filters.agency)
          : state.polls
      if (agencyPolls.length > 0) {
        const months = getMonthsFromPolls(agencyPolls)
        filters = { ...filters, dateFrom: months[0]!, dateTo: months[months.length - 1]! }
        filteredPolls = applyFilters(state.polls, filters)
      }
    }
    const filteredMonthlyAggregates = aggregatePollsByMonth(filteredPolls, get().trendValueMode)
    set({ filters, filteredPolls, filteredMonthlyAggregates })
  },

  setTrendValueMode: (mode) => {
    const state = get()
    const monthlyAggregates = aggregatePollsByMonth(state.polls, mode)
    const filteredMonthlyAggregates = aggregatePollsByMonth(state.filteredPolls, mode)
    set({ trendValueMode: mode, monthlyAggregates, filteredMonthlyAggregates })
  },

  setVoteSource: (source) => {
    const state = get()
    const voteShare = source === null ? null : (
      source.type === 'poll'
        ? state.polls.find((p) => p.id === source.pollId)?.results ?? null
        : state.monthlyAggregates.find((a) => a.monthKey === source.monthKey)?.results ?? null
    )
    if (!voteShare || !state.config) {
      set({ voteSource: source, seatAllocation: null, coalitionResult: null })
      return
    }
    const { rules } = state.config
    const seatAllocation = allocateSeats(
      voteShare,
      rules.totalSeats,
      rules.thresholdPercent,
      { asPercentages: true }
    )
    const selected = state.selectedCoalitionPartyIds
    const coalitionResult = selected.length > 0
      ? buildCoalition({
          voteShare,
          partyIds: selected,
          totalSeats: rules.totalSeats,
          thresholdPercent: rules.thresholdPercent,
        })
      : null
    set({ voteSource: source, seatAllocation, coalitionResult })
  },

  setSelectedCoalitionPartyIds: (ids) => {
    const state = get()
    const voteShare = getVoteShare(state)
    if (!voteShare || !state.config) {
      set({ selectedCoalitionPartyIds: ids, coalitionResult: null })
      return
    }
    const { rules } = state.config
    const coalitionResult = ids.length > 0
      ? buildCoalition({
          voteShare,
          partyIds: ids,
          totalSeats: rules.totalSeats,
          thresholdPercent: rules.thresholdPercent,
        })
      : null
    set({ selectedCoalitionPartyIds: ids, coalitionResult })
  },

  toggleCoalitionParty: (partyId) => {
    const state = get()
    const current = state.selectedCoalitionPartyIds
    const next = current.includes(partyId)
      ? current.filter((id) => id !== partyId)
      : [...current, partyId]
    get().setSelectedCoalitionPartyIds(next)
  },

  loadPolls: async () => {
    const state = get()
    const loader = getPollsLoader(state.countryId, state.electionId)
    set({ loading: true, error: null })
    try {
      const polls = await loader(state.countryId, state.electionId)
      const months = getMonthsFromPolls(polls)
      const dateFrom = state.filters.dateFrom && months.includes(state.filters.dateFrom) ? state.filters.dateFrom : (months[0] ?? '')
      const dateTo = state.filters.dateTo && months.includes(state.filters.dateTo) ? state.filters.dateTo : (months[months.length - 1] ?? '')
      const filters: PollFilters = { ...state.filters, dateFrom, dateTo }
      const filteredPolls = applyFilters(polls, filters)
      const mode = get().trendValueMode
      const monthlyAggregates = aggregatePollsByMonth(polls, mode)
      const filteredMonthlyAggregates = aggregatePollsByMonth(filteredPolls, mode)
      set({ polls, filters, filteredPolls, monthlyAggregates, filteredMonthlyAggregates })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Nepodarilo sa načítať prieskumy' })
    } finally {
      set({ loading: false })
    }
  },
}))
