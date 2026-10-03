import type { Metadata } from 'next'
import { InfoPage, InfoSection } from '@/components/layout/info-page'

export const metadata: Metadata = { title: 'Docs | POTS' }

export default function DocsPage() {
  return (
    <InfoPage title="Docs" intro="How a round works, where the ETH goes, and what you can claim.">
      <InfoSection title="A round">
        <p>
          The grid has 25 blocks, numbered 1 to 25. Pick one or more blocks and deploy the same
          amount of ETH on each. The first deploy of a round starts the timer. The window is read
          from the contract and is 60 seconds on mainnet.
        </p>
        <p>
          When the timer ends the round locks and no one can deploy any more. A random output picks
          one winning block. Miners on the winning block share the prize pool in proportion to the
          ETH they deployed on it.
        </p>
      </InfoSection>

      <InfoSection title="Where the ETH goes">
        <ul className="list-disc pl-5">
          <li>90% of all ETH deployed in the round is the prize pool for the winning block.</li>
          <li>9% goes to the treasury, which also pays the randomness fee of each round.</li>
          <li>1% goes to the jackpot.</li>
        </ul>
        <p>
          If nobody deployed on the winning block, the prize pool rolls over to the next round and
          is added to its pool.
        </p>
        <p>
          ETH deployed on blocks that do not win is not returned. A round that is cancelled refunds
          every deploy in full, with no fee.
        </p>
      </InfoSection>

      <InfoSection title="Jackpot">
        <p>
          Each settled round that has miners on the winning block has a 1 in 625 chance of a jackpot
          hit. On a hit the whole jackpot goes to the miners on the winning block, by the same
          shares. The odds are set in the contract. 1 in 625 is the current default and is
          provisional until the contracts are audited.
        </p>
      </InfoSection>

      <InfoSection title="POTS token">
        <p>
          Every settled round with miners on the winning block mints 1 POTS, split by the same
          shares. Total supply is capped at 1,000,000,000 POTS. At 1 POTS per round the cap is not
          reached in practice. The Token page shows the live values from the contract. This page and
          the app make no statement about price or value.
        </p>
      </InfoSection>

      <InfoSection title="Claims">
        <p>
          Rewards are claimed by you, one ETH claim and one POTS claim per round. There is no
          expiry. A failed claim for one wallet never blocks other wallets or other rounds.
        </p>
      </InfoSection>

      <InfoSection title="Limits">
        <p>
          Each block has a minimum and a maximum deploy. The current mainnet defaults are 0.001 ETH
          to 0.05 ETH per block; the maximum is provisional until the contracts are audited. The
          contract checks the amount, the block list, and the deadline when your transaction is
          included, so a transaction sent close to the deadline can fail.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
