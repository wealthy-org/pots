'use client'

import Link from 'next/link'
import { Modal } from '@/components/ui/modal'
import { MORE_LINKS } from '@/lib/nav'

/** The sheet behind the mobile "More" tab and the header menu button (StyleGuide.md). */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="More">
      <ul className="flex flex-col">
        {MORE_LINKS.map((link) => (
          <li key={link.href}>
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex min-h-11 items-center border-b border-line text-sm text-text-2 hover:text-text"
              >
                {link.label}
              </a>
            ) : (
              <Link
                href={link.href}
                onClick={onClose}
                className="flex min-h-11 items-center border-b border-line text-sm text-text-2 hover:text-text"
              >
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  )
}
