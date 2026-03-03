import { describe, it, expect } from 'vitest'
import { allocateSeats } from './hagenbachBischoff.ts'

// ---------------------------------------------------------------------------
// Základné vlastnosti Hagenbach-Bischoffovej metódy
// (zákon č. 180/2014 Z. z., §68 – Republikanské číslo)
// ---------------------------------------------------------------------------

describe('allocateSeats – základné vlastnosti', () => {
  it('pridelí všetky mandáty', () => {
    const votes = { a: 40, b: 35, c: 25 }
    const result = allocateSeats(votes, 10, 0)
    const total = Object.values(result).reduce((s, v) => s + v, 0)
    expect(total).toBe(10)
  })

  it('strany pod prahom dostanú 0 mandátov', () => {
    const votes = { velka: 60, mala: 3 }
    const result = allocateSeats(votes, 10, 5)
    expect(result.velka).toBeGreaterThan(0)
    expect(result.mala).toBe(0)
  })

  it('pri rovnakom počte percent dostanú strany rovnaký počet mandátov', () => {
    const votes = { a: 50, b: 50 }
    const result = allocateSeats(votes, 10, 0)
    expect(result.a).toBe(5)
    expect(result.b).toBe(5)
  })

  it('väčšia strana dostane viac mandátov ako menšia', () => {
    const votes = { velka: 70, stredna: 20, mala: 10 }
    const result = allocateSeats(votes, 10, 0)
    expect(result.velka).toBeGreaterThan(result.stredna)
    expect(result.stredna).toBeGreaterThan(result.mala)
  })

  it('ak žiadna strana neprekročí prah, vráti 0 pre všetky', () => {
    const votes = { a: 3, b: 2 }
    const result = allocateSeats(votes, 10, 5)
    expect(result.a).toBe(0)
    expect(result.b).toBe(0)
  })

  it('pri jednej strane nad prahom dostane všetky mandáty', () => {
    const votes = { jedina: 80, ostatne: 2 }
    const result = allocateSeats(votes, 10, 5)
    expect(result.jedina).toBe(10)
    expect(result.ostatne).toBe(0)
  })

  it('funguje s 0 mandátmi', () => {
    const votes = { a: 60, b: 40 }
    const result = allocateSeats(votes, 0, 0)
    const total = Object.values(result).reduce((s, v) => s + v, 0)
    expect(total).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Ručne overiteľný príklad
// ---------------------------------------------------------------------------

describe('allocateSeats – ručne overiteľný príklad', () => {
  /**
   * 3 strany, 10 mandátov, prah 0 %:
   *   A: 40 %,  B: 30 %,  C: 30 %
   *
   * Hagenbach-Bischoff (§68):
   *   Súčet hlasov = 100, REN = floor(100 / 11) = 9
   *   A: 40 / 9 = 4,44  → základ = 4, zvyšok = 0,44
   *   B: 30 / 9 = 3,33  → základ = 3, zvyšok = 0,33
   *   C: 30 / 9 = 3,33  → základ = 3, zvyšok = 0,33
   *   Pridelených: 10, zostatok: 0
   *   Výsledok: A = 4,  B = 3,  C = 3
   */
  it('správne prideľuje 10 mandátov pre A=40%, B=30%, C=30%', () => {
    const result = allocateSeats({ A: 40, B: 30, C: 30 }, 10, 0)
    expect(result.A).toBe(4)
    expect(result.B).toBe(3)
    expect(result.C).toBe(3)
  })

  /**
   * 3 strany, 7 mandátov, prah 0 %:
   *   A: 45 %,  B: 35 %,  C: 20 %
   *
   *   Súčet = 100, REN = floor(100 / 8) = 12
   *   A: 45 / 12 = 3,75  → základ = 3, zvyšok = 0,75
   *   B: 35 / 12 = 2,91  → základ = 2, zvyšok = 0,91  ← najväčší
   *   C: 20 / 12 = 1,66  → základ = 1, zvyšok = 0,66
   *   Pridelených: 6, zostatok: 1 → ide B
   *   Výsledok: A = 3,  B = 3,  C = 1
   */
  it('zvyšok pridelí strane s najväčším zvyškom', () => {
    const result = allocateSeats({ A: 45, B: 35, C: 20 }, 7, 0)
    expect(result.A).toBe(3)
    expect(result.B).toBe(3)
    expect(result.C).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Parlamentné voľby SR 2023 (30. septembra 2023)
// Zdroj: Štatistický úrad SR / Wikipedia
//
// Metóda: Hagenbach-Bischoffova kvóta + najväčší zvyšok (zákon č. 180/2014 Z. z., §68)
// Prah: 5 % pre strany, 7 % pre 2–3-stranové koalície, 10 % pre 4+ stranové koalície
// ---------------------------------------------------------------------------

describe('Parlamentné voľby SR 2023', () => {
  /**
   * Výsledky volieb (zdroj: Štatistický úrad SR + Wikipedia):
   *   Smer-SD   681 017 hl. / 22,95 %  →  42 mandátov
   *   PS        533 136 hl. / 17,96 %  →  32 mandátov
   *   Hlas-SD   436 415 hl. / 14,70 %  →  27 mandátov
   *   OĽaNO     264 137 hl. /  8,90 %  →  16 mandátov
   *   KDH       202 515 hl. /  6,82 %  →  12 mandátov
   *   SaS       187 645 hl. /  6,32 %  →  11 mandátov
   *   SNS       166 995 hl. /  5,63 %  →  10 mandátov
   *   Republika 141 099 hl. /  4,75 %  →   0 mandátov (pod 5 % prahom)
   *   Aliancia  130 183 hl. /  4,39 %  →   0 mandátov (pod 5 % prahom)
   *
   * Celkový počet platných hlasov: 2 967 896
   */

  const hlasy2023 = {
    'smer':      22.95,
    'ps':        17.96,
    'hlas':      14.70,
    'olano':      8.90,
    'kdh':        6.82,
    'sas':        6.32,
    'sns':        5.63,
    'republika':  4.75,
    'aliancia':   4.39,
    'demokrati':  2.93,
    'sme-rodina': 2.21,
    'lsns':       0.84,
  }

  it('pridelí spolu 150 mandátov', () => {
    const result = allocateSeats(hlasy2023, 150, 5.0)
    const total = Object.values(result).reduce((s, v) => s + v, 0)
    expect(total).toBe(150)
  })

  it('strany pod 5 % prahom nedostanú mandáty', () => {
    const result = allocateSeats(hlasy2023, 150, 5.0)
    expect(result['republika']).toBe(0)
    expect(result['aliancia']).toBe(0)
    expect(result['demokrati']).toBe(0)
    expect(result['sme-rodina']).toBe(0)
    expect(result['lsns']).toBe(0)
  })

  it('pridelí presne toľko mandátov, koľko dostali strany v skutočných voľbách', () => {
    const result = allocateSeats(hlasy2023, 150, 5.0)
    expect(result['smer']).toBe(42)
    expect(result['ps']).toBe(32)
    expect(result['hlas']).toBe(27)
    expect(result['olano']).toBe(16)
    expect(result['kdh']).toBe(12)
    expect(result['sas']).toBe(11)
    expect(result['sns']).toBe(10)
  })

  it('zachováva poradie strán podľa počtu mandátov', () => {
    const result = allocateSeats(hlasy2023, 150, 5.0)
    expect(result['smer']).toBeGreaterThan(result['ps'])
    expect(result['ps']).toBeGreaterThan(result['hlas'])
    expect(result['hlas']).toBeGreaterThan(result['olano'])
    expect(result['olano']).toBeGreaterThan(result['kdh'])
    expect(result['kdh']).toBeGreaterThan(result['sas'])
    expect(result['sas']).toBeGreaterThan(result['sns'])
  })
})

// ---------------------------------------------------------------------------
// Parlamentné voľby SR 2020 (29. februára 2020)
// Zdroj: Štatistický úrad SR / Wikipedia
//
// Prah: 5 % pre strany, 7 % pre 2–3-stranové koalície, 10 % pre 4+ stranové koalície
// Poznámky:
//   - PS+Spolu: koalícia 2 strán, dosiahla 6,97 % (< 7 %) → 0 mandátov
//   - OĽaNO-NOVA-KÚ-ZZ: koalícia 4 strán, dosiahla 25,03 % (> 10 %) → postúpila
// ---------------------------------------------------------------------------

describe('Parlamentné voľby SR 2020', () => {
  /**
   * Výsledky volieb – iba strany/koalície, ktoré prekročili príslušný prah:
   *   OĽaNO-NOVA-KÚ-ZZ   25,03 %  →  53 mandátov
   *   Smer-SD             18,29 %  →  38 mandátov
   *   Sme Rodina           8,24 %  →  17 mandátov
   *   ĽSNS                 7,97 %  →  17 mandátov
   *   SaS                  6,22 %  →  13 mandátov
   *   Za ľudí              5,77 %  →  12 mandátov
   *   PS+Spolu             6,97 %  →   0 mandátov (pod 7 % koaličným prahom)
   *   KDH                  4,65 %  →   0 mandátov (pod 5 % prahom)
   *
   * Celkový počet platných hlasov: 2 881 511
   */

  // PS+Spolu predávame ako 0 – nedosiahli koaličný prah 7 %
  const hlasy2020 = {
    'olano':      25.03,
    'smer':       18.29,
    'sme-rodina':  8.24,
    'lsns':        7.97,
    'sas':         6.22,
    'za-ludi':     5.77,
    'ps-spolu':    0,     // 6,97 % – nedosiahli 7 % koaličný prah
    'kdh':         4.65,  // pod 5 % prahom
  }

  it('pridelí spolu 150 mandátov', () => {
    const result = allocateSeats(hlasy2020, 150, 5.0)
    const total = Object.values(result).reduce((s, v) => s + v, 0)
    expect(total).toBe(150)
  })

  it('PS+Spolu a KDH nedostanú mandáty', () => {
    const result = allocateSeats(hlasy2020, 150, 5.0)
    expect(result['ps-spolu']).toBe(0)
    expect(result['kdh']).toBe(0)
  })

  it('OĽaNO dostane najviac mandátov', () => {
    const result = allocateSeats(hlasy2020, 150, 5.0)
    const others = Object.entries(result)
      .filter(([k]) => k !== 'olano')
      .map(([, v]) => v)
    expect(result['olano']).toBeGreaterThan(Math.max(...others))
  })

  it('pridelí presne toľko mandátov, koľko dostali strany v skutočných voľbách', () => {
    const result = allocateSeats(hlasy2020, 150, 5.0)
    expect(result['olano']).toBe(53)
    expect(result['smer']).toBe(38)
    expect(result['sme-rodina']).toBe(17)
    expect(result['lsns']).toBe(17)
    expect(result['sas']).toBe(13)
    expect(result['za-ludi']).toBe(12)
  })
})
