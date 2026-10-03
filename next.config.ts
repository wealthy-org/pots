import type { NextConfig } from 'next'
import { describeConfigIssues, resolveChainId, validateConfig } from './lib/config'

if (resolveChainId(process.env) === 4663) {
  const issues = validateConfig(process.env)
  if (issues.length > 0) {
    throw new Error(`Mainnet build is not configured: ${describeConfigIssues(issues)}`)
  }
}

export const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  // The dev badge overlaps the left rail and intercepts clicks in the e2e suite; it is dev only.
  devIndicators: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
