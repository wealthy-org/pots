'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useAccount } from 'wagmi'
import { MoreSheet } from '@/components/layout/more-sheet'
import { NavIcon } from '@/components/layout/nav-icon'
import { Balances } from '@/components/wallet/balances'
import { ConnectButton } from '@/components/wallet/connect-button'
import { activeChain } from '@/lib/chains'
import { NAV_LINKS } from '@/lib/nav'

export function SiteHeader() {
  const pathname = usePathname()
  const { isConnected, chainId } = useAccount()
  const [menuOpen, setMenuOpen] = useState(false)
  // The dot shows the wallet: on the app's network, on another network, or not connected.
  const networkState = !isConnected ? 'idle' : chainId === activeChain.id ? 'ready' : 'wrong'

  return (
    <header className="sticky top-0 z-40 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-3 border-b border-line bg-bg/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <Link
        href="/mine"
        className="flex min-h-11 items-center gap-2.5 text-[15px] font-bold tracking-[0.06em]"
        aria-label="POTS home"
      >
        <span
          aria-hidden="true"
          className="grid h-[34px] w-[34px] place-items-center rounded-[9px] border border-gold/30 bg-[linear-gradient(150deg,var(--mark-1),var(--mark-2))] shadow-[0_6px_18px_-8px_rgba(232,194,122,0.38)]"
        >
          <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none">
            <g fill="rgba(255,255,255,0.28)">
              <rect x="2" y="2" width="4" height="4" rx="1" />
              <rect x="8" y="2" width="4" height="4" rx="1" />
              <rect x="14" y="2" width="4" height="4" rx="1" />
              <rect x="2" y="8" width="4" height="4" rx="1" />
              <rect x="14" y="8" width="4" height="4" rx="1" />
              <rect x="2" y="14" width="4" height="4" rx="1" />
              <rect x="8" y="14" width="4" height="4" rx="1" />
              <rect x="14" y="14" width="4" height="4" rx="1" />
            </g>
            <rect x="8" y="8" width="4" height="4" rx="1" fill="#e6bd6c" />
          </svg>
        </span>
        POTS
      </Link>

      <nav className="ml-2 hidden items-center gap-0.5 md:flex" aria-label="Primary">
        {NAV_LINKS.map((link) => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
                active
                  ? 'bg-gold/10 text-gold'
                  : 'text-text-2 hover:bg-white/[0.03] hover:text-text'
              }`}
            >
              <NavIcon name={link.icon} className="h-[15px] w-[15px]" />
              {link.label}
            </Link>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <span
          role="status"
          title={`Network: ${networkState === 'ready' ? 'wallet connected' : networkState === 'wrong' ? 'wallet on another network' : 'no wallet connected'}`}
          className="hidden h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-text-2 lg:flex"
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              networkState === 'ready'
                ? 'bg-live'
                : networkState === 'wrong'
                  ? 'bg-gold-2'
                  : 'bg-text-3'
            }`}
          />
          {activeChain.name}
          <span className="sr-only">
            {networkState === 'ready'
              ? ', wallet connected'
              : networkState === 'wrong'
                ? ', wallet on another network'
                : ', no wallet connected'}
          </span>
        </span>
        <Balances />
        <ConnectButton />
        <button
          type="button"
          aria-label="Menu"
          onClick={() => setMenuOpen(true)}
          className="grid h-9 w-9 place-items-center rounded-lg text-text-2 hover:bg-white/[0.03] hover:text-text max-md:min-h-11 max-md:min-w-11"
        >
          <svg
            viewBox="0 0 16 16"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
          </svg>
        </button>
      </div>
      <MoreSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  )
}
