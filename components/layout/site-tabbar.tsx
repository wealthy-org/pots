'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_LINKS } from '@/lib/nav'

export function SiteTabbar() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed right-0 bottom-0 left-0 z-50 flex h-16 border-t border-line bg-[rgba(10,10,13,0.94)] px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      aria-label="Primary mobile"
    >
      {NAV_LINKS.map((link) => {
        const active = pathname === link.href
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[10.5px] ${
              active ? 'bg-white/5 text-text' : 'text-text-2'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
