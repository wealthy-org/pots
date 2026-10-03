import type { Metadata } from 'next'
import Link from 'next/link'
import { InfoPage, InfoSection } from '@/components/layout/info-page'

export const metadata: Metadata = { title: 'About | POTS' }

export default function AboutPage() {
  return (
    <InfoPage title="About" intro="POTS is a 5 by 5 grid game on Robinhood Chain.">
      <InfoSection title="What it is">
        <p>
          POTS is the name of this project. You deploy ETH on blocks of a shared grid, a random
          output picks the winning block, and miners on that block share the round. Every round,
          every deploy, and every claim is a transaction on the chain.
        </p>
      </InfoSection>
      <InfoSection title="What it is not">
        <p>
          It is not an investment and it does not promise any return. Most blocks do not win. The
          contracts are not upgradeable, and the app never holds your funds: ETH goes straight to
          the contract.
        </p>
      </InfoSection>
      <InfoSection title="Read more">
        <ul className="flex flex-col">
          {[
            { href: '/docs', name: 'Docs', note: 'the rules of a round' },
            { href: '/fairness', name: 'Fairness', note: 'how the winning block is drawn' },
            { href: '/contracts', name: 'Contracts', note: 'where the code lives' },
          ].map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"
              >
                <span className="font-semibold text-text">{item.name}</span>
                <span className="text-text-2">{item.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </InfoSection>{' '}
    </InfoPage>
  )
}
