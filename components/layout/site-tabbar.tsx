'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { MoreSheet } from '@/components/layout/more-sheet'
import { useChatControls } from '@/components/chat/chat-provider'
import { NavIcon } from '@/components/layout/nav-icon'
import { TAB_LINKS } from '@/lib/nav'

const tabClass = (active: boolean) =>
  `flex flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[10.5px] ${
    active ? 'bg-gold/10 text-gold' : 'text-text-2'
  }`

export function SiteTabbar() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const chat = useChatControls()

  return (
    <>
      <nav
        className="fixed right-0 bottom-0 left-0 z-50 flex h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-line bg-[rgba(10,10,13,0.94)] px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden"
        aria-label="Primary mobile"
      >
        {TAB_LINKS.map((link) => {
          const active = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={tabClass(active)}
            >
              <NavIcon name={link.icon} />
              {link.label}
            </Link>
          )
        })}
        {chat.enabled ? (
          <button
            type="button"
            aria-expanded={chat.open}
            onClick={() => chat.setOpen(!chat.open)}
            className={tabClass(chat.open)}
          >
            <NavIcon name="chat" />
            Chat
          </button>
        ) : null}
        <button type="button" onClick={() => setMoreOpen(true)} className={tabClass(false)}>
          <NavIcon name="more" />
          More
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  )
}
