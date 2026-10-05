'use client'

import Link from 'next/link'
import { useChatControls } from '@/components/chat/chat-provider'
import { Modal } from '@/components/ui/modal'
import { MORE_LINKS } from '@/lib/nav'

/** The sheet behind the mobile "More" tab and the header menu button (StyleGuide.md). */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const chat = useChatControls()
  return (
    <Modal open={open} onClose={onClose} title="More">
      <ul className="flex flex-col">
        {chat.enabled ? (
          <li>
            <button
              type="button"
              onClick={() => {
                onClose()
                chat.setOpen(true)
              }}
              className="flex min-h-11 w-full items-center border-b border-line text-left text-sm text-text-2 hover:text-text"
            >
              Chat
            </button>
          </li>
        ) : null}
        {MORE_LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={onClose}
              className="flex min-h-11 items-center border-b border-line text-sm text-text-2 hover:text-text"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
