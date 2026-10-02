import { describe, expect, it } from 'vitest'
import nextConfig, { securityHeaders } from './next.config'

describe('security headers', () => {
  it('forbids framing and sniffing on every route', async () => {
    const rules = await nextConfig.headers?.()
    expect(rules).toHaveLength(1)
    expect(rules?.[0]?.source).toBe('/:path*')
    const headers = Object.fromEntries(
      (rules?.[0]?.headers ?? []).map((header) => [header.key, header.value]),
    )
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'none'")
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })

  it('does not expose a duplicate header key', () => {
    const keys = securityHeaders.map((header) => header.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
