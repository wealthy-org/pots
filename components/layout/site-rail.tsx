'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useChatControls } from '@/components/chat/chat-provider'
import { NavIcon } from '@/components/layout/nav-icon'
import { RAIL_LINKS } from '@/lib/nav'

const button =
  'grid h-12 w-12 place-items-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-gold'

/**
 * Quick-action rail from 1024 px, 64 px wide with 48 px buttons (SD-19). As on BidGrid, Chat sits at
 * the top of the rail under the header and the page links sit at the bottom. The active page is gold.
 */
export function SiteRail() {
  const pathname = usePathname()
  const chat = useChatControls()

  return (
    <aside
      aria-label="Quick actions"
      className="fixed top-16 bottom-0 left-0 z-30 hidden w-16 flex-col justify-between border-r border-line px-2 py-3 lg:flex"
    >
      <div className="flex flex-col gap-1">
        {chat.enabled ? (
          <button
            type="button"
            title="Chat"
            aria-label="Chat"
            aria-expanded={chat.open}
            onClick={() => chat.setOpen(!chat.open)}
            className={`${button} ${
              chat.open
                ? 'bg-gold/10 text-gold'
                : 'text-text-2 hover:bg-white/[0.03] hover:text-text'
            }`}
          >
            <NavIcon name="chat" className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        {RAIL_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            title={link.label}
            aria-label={link.label}
            aria-current={pathname === link.href ? 'page' : undefined}
            className={`${button} ${
              pathname === link.href
                ? 'bg-gold/10 text-gold'
                : 'text-text-2 hover:bg-white/[0.03] hover:text-text'
            }`}
          >
            <NavIcon name={link.icon} className="h-5 w-5" />
          </Link>
        ))}
      </div>
    </aside>
  )
}
