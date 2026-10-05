import { describe, expect, it } from 'vitest'
import { RESERVED_NICKNAMES, validateNickname } from './nickname'

describe('validateNickname', () => {
  it('accepts 3 to 16 letters, digits, and underscore and returns the lowercase key', () => {
    expect(validateNickname('Neo_One')).toEqual({ ok: true, nickname: 'Neo_One', lower: 'neo_one' })
    expect(validateNickname('abc')).toMatchObject({ ok: true })
    expect(validateNickname('a'.repeat(16))).toMatchObject({ ok: true })
  })

  it('refuses a wrong length, characters, or type', () => {
    for (const bad of ['ab', 'a'.repeat(17), 'a b', 'name!', 'naïve', '', null, 7]) {
      expect(validateNickname(bad)).toEqual({ ok: false })
    }
  })

  it('refuses every reserved word in any case and with digits or underscores at the ends', () => {
    for (const word of RESERVED_NICKNAMES) {
      for (const variant of [word, word.toUpperCase(), `_${word}`, `${word}_`, `${word}99`]) {
        if (variant.length >= 3 && variant.length <= 16) {
          expect(validateNickname(variant)).toEqual({ ok: false })
        }
      }
    }
  })

  it('refuses a name that looks like an address', () => {
    expect(validateNickname('0xabcdef')).toEqual({ ok: false })
    expect(validateNickname('0XABC')).toEqual({ ok: false })
  })

  it('does not refuse a name that merely contains a reserved word', () => {
    expect(validateNickname('adminton')).toMatchObject({ ok: true })
    expect(validateNickname('teammate')).toMatchObject({ ok: true })
  })
})
