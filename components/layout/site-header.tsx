'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_LINKS } from '@/lib/nav'

export function SiteHeader() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-md">
      <Link
        href="/mine"
        className="flex items-center gap-2.5 text-[15px] font-bold tracking-[0.06em]"
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
              className={`flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/[0.045] text-text'
                  : 'text-text-2 hover:bg-white/[0.03] hover:text-text'
              }`}
            >
              {link.label}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
