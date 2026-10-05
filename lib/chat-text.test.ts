import { describe, expect, it } from 'vitest'
import { MAX_BODY_LENGTH, normalizeBody } from './chat-text'

describe('normalizeBody', () => {
  it('trims, keeps plain text, and turns line breaks into spaces', () => {
    expect(normalizeBody('  hello  ')).toBe('hello')
    expect(normalizeBody('a\nb\r\nc')).toBe('a b c')
  })

  it('strips control characters', () => {
    expect(normalizeBody('he\u0000l\u0007lo\u200b'.replace('\u200b', ''))).toBe('hello')
    expect(normalizeBody('\u0001\u0002')).toBeNull()
  })

  it('counts code points, so emoji do not count twice, and enforces 1 to 280', () => {
    expect(normalizeBody('')).toBeNull()
    expect(normalizeBody('   ')).toBeNull()
    expect(normalizeBody('a')).toBe('a')
    expect(normalizeBody('a'.repeat(MAX_BODY_LENGTH))).toHaveLength(MAX_BODY_LENGTH)
    expect(normalizeBody('a'.repeat(MAX_BODY_LENGTH + 1))).toBeNull()
    expect(normalizeBody('🚀'.repeat(MAX_BODY_LENGTH))).not.toBeNull()
    expect(normalizeBody('🚀'.repeat(MAX_BODY_LENGTH + 1))).toBeNull()
  })

  it('applies NFC and rejects non-strings', () => {
    expect(normalizeBody('e\u0301')).toBe('\u00e9')
    expect(normalizeBody(undefined)).toBeNull()
    expect(normalizeBody(5)).toBeNull()
  })

  it('leaves HTML and links as plain text', () => {
    expect(normalizeBody('<script>alert(1)</script> https://x.test')).toBe(
      '<script>alert(1)</script> https://x.test',
    )
  })
})
