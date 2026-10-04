import type { Metadata } from 'next'
import { InfoPage, InfoSection } from '@/components/layout/info-page'
import { autoPlanEnabled, v3Enabled } from '@/lib/contracts'

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
          ETH deployed on blocks that do not win is not returned. A round that is cancelled refunds
          every deploy in full, with no fee.
        </p>
      </InfoSection>

      <InfoSection title="A round with no winner">
        <p>
          If nobody deployed on the winning block, the round has no winner. The 9% and the 1% are
          still taken as in any round. The 90% prize pool is not paid out: it rolls over and is
          added to the pool of the next round that has a winner, where it is shared by the miners on
          that winning block. Several empty rounds in a row add up.
        </p>
        <ul className="list-disc pl-5">
          <li>ETH deployed on blocks that did not win is not returned in a round that settled.</li>
          <li>No POTS is minted for a round without a winner.</li>
          <li>Deploys are refunded in full only when a round is cancelled (see below).</li>
        </ul>
      </InfoSection>

      {autoPlanEnabled ? (
        <InfoSection title="Auto plans">
          <p>
            An auto plan deploys the same blocks, with the same amount on each, in each of the next
            rounds. You pay the whole plan when you start it, from 1 to 100 rounds, and the ETH
            waits in the plan contract until its round comes. There is no plan fee.
          </p>
          <ul className="list-disc pl-5">
            <li>
              You can stop the plan at any time and take back the ETH that is not yet deployed. ETH
              already deployed in a round follows the normal round rules.
            </li>
            <li>
              The scheduler enters the round for you. It cannot change your blocks or amount, and it
              can only place the deploys of your plan. Only you can take the ETH back, with Stop
              auto.
            </li>
            <li>
              While a plan is active, the scheduler also opens the next round, so a round can start
              a few seconds after the last one is settled.
            </li>
            <li>
              Loop rewards, when you turn it on, moves the ETH you won in the plan&apos;s last round
              into the plan. It needs a separate permission from your wallet, and you can turn it
              off at any time.
            </li>
            <li>
              A plan ends when its ETH no longer covers one more round. Stop it then to take back
              what is left. A round that cannot take the deploy is skipped. Outcomes stay random and
              a plan does not improve your odds.
            </li>
          </ul>
        </InfoSection>
      ) : null}
      {v3Enabled ? (
        <InfoSection title="Referrals and burn">
          <p>
            A wallet can have one referrer. It is set once, for good, and only before the wallet
            deploys for the first time. You cannot refer yourself. When a referred wallet claims
            POTS, the contract mints an extra 1% of that claim to the referrer. The referred wallet
            pays nothing and gets the same reward as anyone else, and no ETH is involved.
          </p>
          <p>
            Anyone can burn POTS they hold from the Token page. A burn is permanent and lowers the
            total supply. It does not lower the total ever minted, so the cap is counted on the
            amount ever minted and a burn never makes room for more POTS.
          </p>
        </InfoSection>
      ) : null}
      <InfoSection title="Who can stop what">
        <ul className="list-disc pl-5">
          <li>
            Nobody can deploy for you, move your ETH, or change your claim. Taking part is your
            choice in every round.
          </li>
          <li>
            The owner (a multisig on mainnet) can pause new deploys. While paused, claims, refunds,
            settlement, and cancellations of stuck rounds keep working, so a pause never locks
            funds. The owner can withdraw the treasury share, but not deploys, unclaimed prizes, the
            rollover, or the jackpot. The owner cannot change the rules, the amounts, or the odds
            (they are fixed when the contract is deployed), cannot mint POTS, and cannot cancel a
            healthy round.
          </li>
          <li>
            Anyone can move a round forward: start it, lock it, request the random output, and
            settle it. The app does this on a schedule, and if the schedule stops, any person can do
            it (the Operator page lists the steps).
          </li>
          <li>
            A round that gets stuck can be cancelled by anyone after a waiting time: 1 hour after it
            locked, or 1 day after the random output was requested without an answer (mainnet
            defaults). Every deploy of that round is then refunded in full.
          </li>
          <li>
            The randomness fee is paid from the treasury. If the treasury cannot cover it, the round
            waits until anyone tops the treasury up; deploys already made stay safe in the contract.
          </li>
        </ul>
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
