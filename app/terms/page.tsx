import type { Metadata } from 'next'
import { InfoPage, InfoSection } from '@/components/layout/info-page'

export const metadata: Metadata = { title: 'Terms | POTS' }

export default function TermsPage() {
  return (
    <InfoPage
      title="Terms"
      status="Draft pending legal review. These terms are not final and are not legal advice."
    >
      <InfoSection title="Who can use it">
        <p>
          You must be 18 or older, and you are responsible for checking that using a game of chance
          with ETH is allowed where you live.
        </p>
      </InfoSection>
      <InfoSection title="Risk">
        <p>
          The outcome of each round is random. ETH deployed on blocks that do not win is not
          returned, and you can lose everything you deploy. The contracts are unaudited until an
          independent review is published, and a bug can cause a loss of funds.
        </p>
      </InfoSection>
      <InfoSection title="Testnet">
        <p>
          The testnet deployment uses ETH and the POTS token without value. Nothing there is real
          money.
        </p>
      </InfoSection>
      <InfoSection title="No custody">
        <p>
          The app does not hold, move, or recover your funds. Transactions are signed in your wallet
          and executed by the contract. Lost keys cannot be recovered by anyone.
        </p>
      </InfoSection>
      <InfoSection title="Changes">
        <p>
          The game rules in a deployed contract cannot be changed. A new version is a new deployment
          with a visible notice. The contract owner, planned to be a multisignature wallet on
          mainnet, can pause new deploys and withdraw the treasury share, but cannot change a round
          or take a player&apos;s claim. These terms can change before launch.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
