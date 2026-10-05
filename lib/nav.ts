import { v3Enabled } from './contracts'
import { indexerEnabled } from './indexer'

export type NavIconName =
  'mine' | 'token' | 'stats' | 'history' | 'more' | 'docs' | 'fairness' | 'contracts' | 'chat'

/** Primary navigation, in the order of mine.html. Stake joins when the staking feature ships (SD-08). */
export const NAV_LINKS = [
  { href: '/mine', label: 'Mine', icon: 'mine' },
  { href: '/token', label: 'Token', icon: 'token' },
  { href: '/stats', label: 'Stats', icon: 'stats' },
  { href: '/history', label: 'History', icon: 'history' },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: NavIconName }>

/** Left rail buttons. Chat is omitted until the owner reopens it (D-22). */
export const RAIL_LINKS = [
  { href: '/docs', label: 'Docs', icon: 'docs' },
  { href: '/fairness', label: 'Fairness', icon: 'fairness' },
  { href: '/contracts', label: 'Contracts', icon: 'contracts' },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: NavIconName }>

/** Links of the mobile "More" sheet and of the header menu below 1024 px. */
export const MORE_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/profile', label: 'Profile' },
  ...(indexerEnabled ? [{ href: '/leaderboard', label: 'Leaderboard' }] : []),
  ...(v3Enabled ? [{ href: '/referrals', label: 'Referrals' }] : []),
  { href: '/docs', label: 'Docs' },
  { href: '/fairness', label: 'Fairness' },
  { href: '/contracts', label: 'Contracts' },
  { href: '/about', label: 'About' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
]

/** Row under the deploy button; the 18+ notice is plain text next to it. */
export const FOOTER_LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/about', label: 'About' },
  { href: '/token', label: 'Token' },
  ...(v3Enabled ? [{ href: '/referrals', label: 'Referrals' }] : []),
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
]
