'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NavIcon } from '@/components/layout/nav-icon'
import { RAIL_LINKS } from '@/lib/nav'

/** Quick-action rail of mine.html. The active page is marked in gold. */
export function SiteRail() {
  const pathname = usePathname()

  return (
    <aside
      aria-label="Quick actions"
      className="fixed top-16 bottom-0 left-0 z-30 hidden w-[52px] flex-col justify-end gap-1 border-r border-line px-1.5 py-3 lg:flex"
    >
      {RAIL_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          title={link.label}
          aria-label={link.label}
          aria-current={pathname === link.href ? 'page' : undefined}
          className={`grid h-9 w-full place-items-center rounded-lg transition-colors ${
            pathname === link.href
              ? 'bg-gold/10 text-gold'
              : 'text-text-2 hover:bg-white/[0.03] hover:text-text'
          }`}
        >
          <NavIcon name={link.icon} />
        </Link>
      ))}
    </aside>
  )
}
