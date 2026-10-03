import Link from 'next/link'
import { FOOTER_LINKS } from '@/lib/nav'

/** Row under the deploy button in mine.html: real pages, plus the 18+ notice as plain text. */
export function FooterLinks() {
  return (
    <nav
      aria-label="Footer"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-text-3"
    >
      {FOOTER_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="inline-flex min-h-11 min-w-11 items-center justify-center px-1 hover:text-text"
        >
          {link.label}
        </Link>
      ))}
      <span>18+</span>
    </nav>
  )
}
