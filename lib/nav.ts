import { v3Enabled } from './contracts'
import { indexerEnabled } from './indexer'

export type NavIconName =
  | 'mine'
  | 'token'
  | 'stats'
  | 'history'
  | 'more'
  | 'docs'
  | 'fairness'
  | 'contracts'
  | 'chat'
  | 'leaderboard'

type NavLink = { href: string; label: string; icon: NavIconName }

/**
 * Top navigation from 1024 px (SD-19): Docs sits right of Mine and Leaderboard right of History.
 * Leaderboard shows only while the indexer is enabled. Stake joins when staking ships (SD-08).
 */
export const NAV_LINKS: ReadonlyArray<NavLink> = [
  { href: '/mine', label: 'Mine', icon: 'mine' },
  { href: '/docs', label: 'Docs', icon: 'docs' },
  { href: '/token', label: 'Token', icon: 'token' },
  { href: '/stats', label: 'Stats', icon: 'stats' },
  { href: '/history', label: 'History', icon: 'history' },
  ...(indexerEnabled
    ? [{ href: '/leaderboard', label: 'Leaderboard', icon: 'leaderboard' } as const]
    : []),
]

/** Bottom bar below 1024 px: four links, then Chat (when on) and More (six buttons at most). */
export const TAB_LINKS: ReadonlyArray<NavLink> = [
  { href: '/mine', label: 'Mine', icon: 'mine' },
  { href: '/token', label: 'Token', icon: 'token' },
  { href: '/stats', label: 'Stats', icon: 'stats' },
  { href: '/history', label: 'History', icon: 'history' },
]

/** Left rail buttons at the bottom of the rail, from 1024 px. Chat sits at the top of the rail. */
export const RAIL_LINKS: ReadonlyArray<NavLink> = [
  { href: '/fairness', label: 'Fairness', icon: 'fairness' },
  { href: '/contracts', label: 'Contracts', icon: 'contracts' },
]
/** Links of the mobile "More" sheet and of the header menu. */
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
