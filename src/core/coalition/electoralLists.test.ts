import { describe, it, expect } from 'vitest'
import type { Party } from '../../data/types.ts'
import { allocateSeats } from '../allocation/index.ts'
import { aggregatePollsByMonth } from '../aggregation/index.ts'
import type { Poll } from '../../data/types.ts'
import { buildCoalition } from './coalitionBuilder.ts'
import {
  makeThresholdFn,
  resolveSelection,
  sumSelection,
  thresholdForParty,
} from './electoralLists.ts'

const party = (id: string, members?: string[]): Party => ({
  id,
  name: id,
  shortName: id,
  color: '#000',
  order: 0,
  ...(members ? { members } : {}),
})

const parties: Party[] = [
  party('ps'),
  party('demokrati'),
  party('kdh'),
  party('sas'),
  party('smer'),
  party('ps_demokrati', ['ps', 'demokrati']),
]

const rules = { thresholdPercent: 5, coalitionThresholdPercent: 7, largeCoalitionThresholdPercent: 10 }

/** Ipsos, november 2026 — first poll with the joint list (rounded, other parties omitted) */
const joint = { ps_demokrati: 24.1, smer: 17.2, sas: 8.5, kdh: 6.9 }
/** AKO, október 2026 — PS and Demokrati still separate */
const separate = { ps: 19.1, demokrati: 5.1, smer: 16.6, sas: 8.6, kdh: 7.3 }

describe('thresholdForParty – kvórum podľa zákona 180/2014 §66', () => {
  it('strana 5 %, koalícia 2–3 strán 7 %, koalícia 4+ strán 10 %', () => {
    expect(thresholdForParty(party('ps'), rules)).toBe(5)
    expect(thresholdForParty(party('x', ['a', 'b']), rules)).toBe(7)
    expect(thresholdForParty(party('x', ['a', 'b', 'c']), rules)).toBe(7)
    expect(thresholdForParty(party('x', ['a', 'b', 'c', 'd']), rules)).toBe(10)
  })

  it('bez nastavenia v election.json použije slovenské predvolené 7 / 10 %', () => {
    expect(thresholdForParty(party('x', ['a', 'b']), { thresholdPercent: 5 })).toBe(7)
    expect(thresholdForParty(party('x', ['a', 'b', 'c', 'd']), { thresholdPercent: 5 })).toBe(10)
  })

  it('neznáma strana dostane prah pre stranu', () => {
    expect(makeThresholdFn(parties, rules)('neznama')).toBe(5)
  })
})

describe('allocateSeats s prahom pre koalície', () => {
  it('koalícia na 6,5 % nedostane mandáty, strana na 6,5 % áno', () => {
    const votes = { ps_demokrati: 6.5, sas: 6.5, smer: 30 }
    const result = allocateSeats(votes, 150, makeThresholdFn(parties, rules))
    expect(result.ps_demokrati).toBe(0)
    expect(result.sas).toBeGreaterThan(0)
    expect(result.smer + result.sas).toBe(150)
  })

  it('PS + SPOLU 2020: koalícia na 6,96 % sa do parlamentu nedostala', () => {
    const ps2020 = [party('ps_spolu', ['ps', 'spolu']), party('olano'), party('smer')]
    const votes = { ps_spolu: 6.96, olano: 25.02, smer: 18.29 }
    const result = allocateSeats(votes, 150, makeThresholdFn(ps2020, rules))
    expect(result.ps_spolu).toBe(0)
  })

  it('číselný prah funguje ako predtým', () => {
    expect(allocateSeats({ a: 6.5, b: 30 }, 150, 7).a).toBe(0)
  })
})

describe('resolveSelection – uložené strany vs. subjekty v prieskume', () => {
  it('všetci členovia vybraní + prieskum má spoločnú kandidátku → počíta sa koalícia', () => {
    const r = resolveSelection(['ps', 'demokrati', 'kdh', 'sas'], joint, parties)
    expect(r.subjects).toEqual(['ps_demokrati', 'kdh', 'sas'])
    expect(r.blocked).toEqual([])
  })

  it('len časť členov (PS bez Demokratov) → koalícia sa nezapočíta a vráti sa dôvod', () => {
    const r = resolveSelection(['ps', 'kdh', 'sas'], joint, parties)
    expect(r.subjects).toEqual(['kdh', 'sas'])
    expect(r.blocked).toEqual([{ listId: 'ps_demokrati', selected: ['ps'], missing: ['demokrati'] }])
  })

  it('prieskum so samostatnými stranami → bez zmeny', () => {
    expect(resolveSelection(['ps', 'kdh', 'sas'], separate, parties)).toEqual({
      subjects: ['ps', 'kdh', 'sas'],
      blocked: [],
    })
    expect(resolveSelection(['ps', 'demokrati', 'kdh'], separate, parties).subjects).toEqual([
      'ps',
      'demokrati',
      'kdh',
    ])
  })

  it('priamo vybraná koalícia sa v staršom prieskume rozloží na členov', () => {
    expect(resolveSelection(['ps_demokrati', 'sas'], separate, parties).subjects).toEqual([
      'ps',
      'demokrati',
      'sas',
    ])
    expect(resolveSelection(['ps_demokrati', 'sas'], joint, parties).subjects).toEqual([
      'ps_demokrati',
      'sas',
    ])
  })

  it('výber bez členov koalície sa nemení', () => {
    expect(resolveSelection(['smer', 'sas'], joint, parties)).toEqual({
      subjects: ['smer', 'sas'],
      blocked: [],
    })
  })

  it('poradie: koalícia na mieste prvého vybraného člena', () => {
    expect(resolveSelection(['kdh', 'demokrati', 'sas', 'ps'], joint, parties).subjects).toEqual([
      'kdh',
      'ps_demokrati',
      'sas',
    ])
  })

  it('funguje aj so Set-om nahlásených subjektov', () => {
    const r = resolveSelection(['ps', 'demokrati'], new Set(['ps_demokrati', 'smer']), parties)
    expect(r.subjects).toEqual(['ps_demokrati'])
  })

  it('sumSelection sčíta reálne subjekty', () => {
    expect(sumSelection(['ps', 'demokrati', 'kdh'], joint, parties)).toBeCloseTo(31.0)
    expect(sumSelection(['ps', 'demokrati', 'kdh'], separate, parties)).toBeCloseTo(31.5)
  })
})

describe('buildCoalition so spoločnou kandidátkou', () => {
  const base = { totalSeats: 150, thresholdPercent: makeThresholdFn(parties, rules), parties }

  it('PS + Demokrati + KDH + SaS: mandáty koalície namiesto jednotlivých strán', () => {
    const r = buildCoalition({ ...base, voteShare: joint, partyIds: ['ps', 'demokrati', 'kdh', 'sas'] })
    expect(r.partyIds).toEqual(['ps_demokrati', 'kdh', 'sas'])
    expect(r.totalVotePercent).toBeCloseTo(39.5)
    expect(r.totalSeats).toBe(
      r.perPartySeats.ps_demokrati + r.perPartySeats.kdh + r.perPartySeats.sas,
    )
    expect(r.perPartySeats.ps_demokrati).toBeGreaterThan(0)
    expect(r.blocked).toEqual([])
  })

  it('PS + KDH + SaS: PS sa nezapočíta, blocked vysvetlí prečo', () => {
    const r = buildCoalition({ ...base, voteShare: joint, partyIds: ['ps', 'kdh', 'sas'] })
    expect(r.partyIds).toEqual(['kdh', 'sas'])
    expect(r.totalSeats).toBe(r.perPartySeats.kdh + r.perPartySeats.sas)
    expect(r.blocked.map((b) => b.listId)).toEqual(['ps_demokrati'])
  })

  it('bez parties sa správa ako predtým', () => {
    const r = buildCoalition({ voteShare: separate, partyIds: ['ps', 'kdh'], totalSeats: 150, thresholdPercent: 5 })
    expect(r.partyIds).toEqual(['ps', 'kdh'])
    expect(r.blocked).toEqual([])
  })
})

describe('aggregatePollsByMonth – strana chýbajúca v prieskume nie je 0 %', () => {
  const poll = (id: string, results: Record<string, number>): Poll => ({
    id,
    countryId: 'sk',
    electionId: 'sk-2024',
    agency: id,
    fieldworkStart: '2026-11-10',
    fieldworkEnd: '2026-11-15',
    results,
  })

  it('v prechodnom mesiaci sa PS priemeruje len z prieskumov, ktoré ho merali', () => {
    const [nov] = aggregatePollsByMonth([poll('ipsos', joint), poll('ako', separate)])
    expect(nov.pollCount).toBe(2)
    expect(nov.results.ps).toBeCloseTo(19.1)
    expect(nov.results.ps_demokrati).toBeCloseTo(24.1)
    expect(nov.results.smer).toBeCloseTo((17.2 + 16.6) / 2)
  })
})
