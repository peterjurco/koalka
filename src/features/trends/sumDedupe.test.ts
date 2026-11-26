import { describe, it, expect } from 'vitest'
import type { Party } from '../../data/types.ts'
import { duplicatedParty } from './sumDedupe.ts'

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
  party('ps_demokrati', ['ps', 'demokrati']),
]

const joint = { ps_demokrati: 22.2, kdh: 6.1 }
const separate = { ps: 17.4, demokrati: 5.8, kdh: 6.4 }

describe('duplicatedParty – súčet, ktorý len opakuje jednu zobrazenú stranu', () => {
  it('PS + Demokrati v prieskume so spoločnou kandidátkou, kandidátka zobrazená', () => {
    expect(duplicatedParty(['ps', 'demokrati'], joint, parties, { ps_demokrati: 22.2 })).toBe(
      'ps_demokrati',
    )
  })

  it('kandidátka nie je zobrazená → súčet sa ukáže', () => {
    expect(duplicatedParty(['ps', 'demokrati'], joint, parties, {})).toBeNull()
  })

  it('strany ešte osobitne → skutočný súčet, nie duplikát', () => {
    expect(
      duplicatedParty(['ps', 'demokrati'], separate, parties, { ps_demokrati: null }),
    ).toBeNull()
  })

  it('súčet viacerých subjektov nie je duplikát', () => {
    expect(
      duplicatedParty(['ps', 'demokrati', 'kdh'], joint, parties, { ps_demokrati: 22.2, kdh: 6.1 }),
    ).toBeNull()
  })
})
