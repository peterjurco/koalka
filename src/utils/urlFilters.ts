import type { PollFilters } from '../state/store.ts'

/**
 * Read filter params from the current URL. Returns filters valid for the given
 * months and agencies; falls back to full range and no agency if URL is missing or invalid.
 * Call only when data is ready (e.g. in setElection after loading polls).
 */
export function getFiltersFromUrl(
  months: string[],
  validAgencies: string[]
): PollFilters {
  const fallback: PollFilters = {
    agency: null,
    dateFrom: months.length > 0 ? months[0]! : '',
    dateTo: months.length > 0 ? months[months.length - 1]! : '',
  }
  if (typeof window === 'undefined') return fallback
  const params = new URLSearchParams(window.location.search)
  const agency = params.get('agency')
  const dateFrom = params.get('dateFrom')
  const dateTo = params.get('dateTo')
  let dateFromVal = dateFrom && months.includes(dateFrom) ? dateFrom : fallback.dateFrom
  let dateToVal = dateTo && months.includes(dateTo) ? dateTo : fallback.dateTo
  // Clamp to available data so a stale URL (e.g. dateTo=2025-11 before Dec 2025 was added) doesn't hide new months
  if (months.length > 0) {
    if (dateFromVal > months[0]!) dateFromVal = months[0]!
    if (dateToVal < months[months.length - 1]!) dateToVal = months[months.length - 1]!
  }
  const filters: PollFilters = {
    agency:
      agency === null || agency === ''
        ? null
        : validAgencies.includes(agency)
          ? agency
          : null,
    dateFrom: dateFromVal,
    dateTo: dateToVal,
  }
  return filters
}

/** Update the current URL to reflect the given filters (e.g. when user changes a dropdown). */
export function replaceUrlWithFilters(filters: PollFilters): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams()
  if (filters.agency != null && filters.agency !== '') params.set('agency', filters.agency)
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
  if (filters.dateTo) params.set('dateTo', filters.dateTo)
  const qs = params.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', url)
}
