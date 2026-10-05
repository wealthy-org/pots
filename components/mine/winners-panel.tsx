'use client'

import { useState } from 'react'
import { EthMark, PotsMark } from '@/components/ui/token-mark'
import { useSettledRounds } from '@/hooks/use-settled-rounds'
import { avatarHue, shortenAddress } from '@/lib/format'
import { formatWeiToEth } from '@/lib/wei'

export type WinnerClaimState = 'ready' | 'claimed'

function Badge({ kind }: { kind: 'you' | 'top' }) {
  return (
    <span
      className={`ml-1.5 rounded-full px-1.5 py-px text-[9px] font-semibold tracking-[0.08em] uppercase ${
        kind === 'you' ? 'bg-gold-2 text-gold-ink' : 'border border-gold/40 text-gold'
      }`}
    >
      {kind}
    </span>
  )
}

/**
 * Recent winners, as in mine.html: a collapsible list with avatar, blocks, ETH, and POTS per
 * winner. `wallet` marks the connected wallet's row with YOU and `claimState` shows its claim
 * state for the latest round (ADR-014). TOP marks the largest share on the winning block.
 */
export function WinnersPanel({
  wallet,
  claimStateFor,
  revealing = false,
}: {
  wallet?: string
  claimStateFor?: (roundId: bigint) => WinnerClaimState | null
  /** True while the grid still scans toward the winning block: the list must not give it away. */
  revealing?: boolean
}) {
  const { data, isLoading, isError } = useSettledRounds(3)
  const [open, setOpen] = useState(true)
  const largest = data?.largestEntryWei ?? 0n
  const total = data?.winnersTotal ?? 0
  const latest = data?.rounds[0]
  const claimState = latest ? (claimStateFor?.(latest.roundId) ?? null) : null

  return (
    <section className="mt-4" aria-label="Recent winners">
      <div className="flex items-center justify-between border-b border-line px-1 py-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex min-h-11 items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase hover:text-text"
        >
          Winners
          <svg
            viewBox="0 0 12 12"
            className={`h-3 w-3 transition-transform ${open ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M3 7.5L6 4.5l3 3" />
          </svg>
        </button>
        <span className="font-mono text-[11px] text-text-3">
          {revealing
            ? 'Revealing...'
            : latest
              ? `Round #${latest.roundId.toString()} · ${total} ${total === 1 ? 'winner' : 'winners'}`
              : 'No settled rounds'}
        </span>
      </div>

      {open && !revealing ? (
        <>
          {isLoading ? <p className="px-1 py-4 text-xs text-text-2">Loading rounds...</p> : null}
          {isError ? (
            <p className="px-1 py-4 text-xs text-text-2">
              Winner history needs the indexer. Until then, the last settled round loads directly
              from the chain when the RPC allows the log range.
            </p>
          ) : null}

          {data?.winners.length ? (
            <div className="mt-1">
              {data.winners.map((winner) => {
                const mine = wallet && winner.wallet.toLowerCase() === wallet.toLowerCase()
                return (
                  <div
                    key={winner.wallet}
                    className="grid grid-cols-[minmax(0,1fr)_44px_72px_72px] items-center gap-2 border-b border-white/5 px-1 py-2 sm:grid-cols-[minmax(0,1fr)_56px_92px_92px]"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span
                        aria-hidden="true"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-gold-ink"
                        style={{
                          background: mine
                            ? 'linear-gradient(135deg,var(--gold-1),var(--gold-3))'
                            : `linear-gradient(135deg,hsl(${avatarHue(winner.wallet)} 60% 72%),hsl(${avatarHue(winner.wallet) + 10} 45% 42%))`,
                        }}
                      >
                        {winner.wallet[2]}
                      </span>
                      <span className="min-w-0 truncate font-mono text-xs text-text-2">
                        {mine ? 'You' : shortenAddress(winner.wallet)}
                      </span>
                      {mine ? (
                        <>
                          <Badge kind="you" />
                          {claimState ? (
                            <span className="text-[10px] text-text-3">
                              {claimState === 'ready' ? 'claim ready' : 'claimed'}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                      {total > 1 && winner.entryWei === largest ? <Badge kind="top" /> : null}
                    </span>
                    <span className="text-right font-mono text-xs text-text-2">
                      <span className="sr-only">Blocks: </span>
                      {winner.blocks}
                    </span>
                    <span className="flex items-center justify-end gap-1 font-mono text-xs text-text-2">
                      <EthMark className="h-3 w-3" />
                      <span className="sr-only">ETH deployed: </span>
                      {formatWeiToEth(winner.entryWei, 5)}
                    </span>
                    <span className="flex items-center justify-end gap-1 font-mono text-xs font-semibold text-gold">
                      <PotsMark className="h-3 w-3" />
                      <span className="sr-only">POTS: </span>
                      {formatWeiToEth(winner.potsWei, 4)}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : null}

          {data?.rounds.length && !data.winners.length && !isLoading ? (
            <p className="px-1 py-4 text-xs text-text-2">
              No miners on the winning block in the latest settled round. The pool rolls over.
            </p>
          ) : null}

          {data?.rounds.slice(1).map((round) => (
            <div
              key={round.roundId.toString()}
              className="flex items-center justify-between gap-2 border-b border-white/5 px-1 py-2 text-xs text-text-2"
            >
              <span className="font-mono">Round #{round.roundId.toString()}</span>
              <span className="font-mono">Block {round.winningSquare}</span>
              <span className="font-mono">{formatWeiToEth(round.pool, 4)} ETH pool</span>
              {round.jackpotHit ? <span className="text-gold">Jackpot</span> : null}
            </div>
          ))}
        </>
      ) : null}
    </section>
  )
}
