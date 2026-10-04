'use client'

import { useState, useSyncExternalStore } from 'react'
import { isAddress, getAddress } from 'viem'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { useReferral } from '@/hooks/use-referral'
import { useReferralEarnings } from '@/hooks/use-leaderboard'
import { useReferralWrites } from '@/hooks/use-referral-writes'
import { v3Enabled } from '@/lib/contracts'
import { indexerEnabled } from '@/lib/indexer'
import { formatWeiToEth } from '@/lib/wei'
import { shortenAddress } from '@/lib/format'
import { referralLink } from '@/lib/referral'

const noop = () => () => {}

function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => '',
  )
}

export default function ReferralsPage() {
  const { address, isConnected } = useAccount()
  const origin = useOrigin()
  const referral = useReferral(address)
  const writes = useReferralWrites()
  const earnings = useReferralEarnings(address)
  const [copied, setCopied] = useState(false)
  const [typed, setTyped] = useState<string | null>(null)

  if (!v3Enabled) {
    return (
      <section aria-labelledby="ref-title" className="flex flex-col gap-4">
        <h1 id="ref-title" className="text-2xl font-bold">
          Referrals
        </h1>
        <EmptyState
          title="Referrals are not active yet"
          description="They open with the next contract version."
        />
      </section>
    )
  }

  const link = address ? referralLink(origin, address) : ''
  const candidate = typed ?? referral.linkRef ?? ''
  const candidateValid = isAddress(candidate, { strict: false })
  const isSelf = Boolean(address) && candidate.toLowerCase() === address?.toLowerCase()

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  let tagState: string | null = null
  if (referral.known && !referral.canTag) {
    tagState = referral.referrer
      ? 'Your referrer is set and cannot be changed.'
      : 'A referrer can only be set before your first deploy, and you have already deployed.'
  }

  return (
    <section aria-labelledby="ref-title" className="flex flex-col gap-4">
      <div>
        <h1 id="ref-title" className="text-2xl font-bold">
          Referrals
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          Share your link. When a wallet that came through it claims POTS, the contract mints 1% of
          that claim to you, on top of the reward. It costs the other wallet nothing and pays no
          ETH.
        </p>
      </div>

      {!isConnected ? (
        <EmptyState
          title="Connect a wallet"
          description="Your link and your referrer are tied to your wallet address."
        />
      ) : (
        <>
          <Panel>
            <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
              Your link
            </h2>
            <p className="mt-2 font-mono text-xs break-all text-text">{link}</p>
            <div className="mt-3 flex items-center gap-3">
              <Button variant="secondary" onClick={copy}>
                Copy link
              </Button>
              <span role="status" className="text-xs text-text-2">
                {copied ? 'Copied' : ''}
              </span>
            </div>
            <p className="mt-3 text-xs text-text-2">
              A wallet is tagged once, for good, and only before its first deploy. You cannot tag
              yourself.
            </p>
          </Panel>

          {indexerEnabled ? (
            <Panel>
              <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
                Your referral earnings
              </h2>
              {earnings.data ? (
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-[11px] text-text-3">Wallets referred</dt>
                    <dd className="font-mono">{earnings.data.earnings.referrals}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-text-3">POTS bonus earned</dt>
                    <dd className="font-mono">
                      {formatWeiToEth(earnings.data.earnings.referralPots, 4)} POTS
                    </dd>
                  </div>
                </dl>
              ) : earnings.isError ? (
                <p role="alert" className="mt-2 text-xs text-text-2">
                  The indexer did not return your earnings. Try again in a moment.
                </p>
              ) : (
                <p className="mt-2 text-xs text-text-2">Loading...</p>
              )}
            </Panel>
          ) : null}
          <Panel>
            <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
              Your referrer
            </h2>
            <p className="mt-2 font-mono text-sm break-all">
              {referral.referrer ? referral.referrer : referral.known ? 'None' : 'Loading...'}
            </p>
            {tagState ? <p className="mt-2 text-xs text-text-2">{tagState}</p> : null}

            {referral.canTag ? (
              <form
                className="mt-4 flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (candidateValid && !isSelf) {
                    writes.setReferrer(getAddress(candidate))
                  }
                }}
              >
                <label
                  htmlFor="referrer-input"
                  className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase"
                >
                  Set a referrer
                </label>
                <input
                  id="referrer-input"
                  value={candidate}
                  onChange={(event) => setTyped(event.target.value.trim())}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0x..."
                  aria-invalid={candidate.length > 0 && (!candidateValid || isSelf)}
                  aria-describedby="referrer-help"
                  className="min-h-11 rounded-md border border-line-2 bg-bg px-3 font-mono text-sm outline-none focus-visible:border-gold"
                />
                <p
                  id="referrer-help"
                  className={`text-xs ${candidate.length > 0 && (!candidateValid || isSelf) ? 'text-loss' : 'text-text-2'}`}
                >
                  {candidate.length > 0 && !candidateValid
                    ? 'Enter a valid wallet address.'
                    : isSelf
                      ? 'You cannot refer yourself.'
                      : 'Also works for a wallet that starts with an auto plan: set it before the first plan round.'}
                </p>
                <div>
                  <Button
                    type="submit"
                    disabled={
                      !candidateValid || isSelf || writes.isSubmitting || writes.isConfirming
                    }
                  >
                    {writes.isSubmitting || writes.isConfirming
                      ? 'Confirming...'
                      : `Set referrer${candidateValid && !isSelf ? ` ${shortenAddress(candidate)}` : ''}`}
                  </Button>
                </div>
                {writes.isConfirmed ? (
                  <p role="status" className="text-xs text-live">
                    Referrer set.
                  </p>
                ) : null}
                {writes.errorMessage ? (
                  <p role="alert" className="text-xs text-loss">
                    {writes.errorMessage}
                  </p>
                ) : null}
              </form>
            ) : null}
          </Panel>
        </>
      )}
    </section>
  )
}
