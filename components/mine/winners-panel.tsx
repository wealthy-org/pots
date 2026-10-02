'use client'

import { useSettledRounds } from '@/hooks/use-settled-rounds'
import { shortenAddress } from '@/lib/format'
import { formatWeiToEth } from '@/lib/wei'

export function WinnersPanel() {
  const { data, isLoading, isError } = useSettledRounds(3)

  return (
    <section className="mt-4" aria-label="Recent winners">
      <div className="flex items-center justify-between border-b border-line px-1 py-2">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
          Winners
        </h2>
        <span className="font-mono text-[11px] text-text-3">
          {data?.rounds[0] ? `Round #${data.rounds[0].roundId.toString()}` : 'No settled rounds'}
        </span>
      </div>

      {isLoading ? <p className="px-1 py-4 text-xs text-text-2">Loading rounds...</p> : null}
      {isError ? (
        <p className="px-1 py-4 text-xs text-text-2">
          Winner history needs the indexer. Until then, the last settled round loads directly from
          the chain when the RPC allows the log range.
        </p>
      ) : null}

      {data?.winners.length ? (
        <div className="mt-1">
          {data.winners.map((winner) => (
            <div
              key={winner.wallet}
              className="grid grid-cols-[minmax(0,1fr)_90px_90px] items-center gap-2 border-b border-white/5 px-1 py-2"
            >
              <span className="truncate font-mono text-xs text-text-2">
                {shortenAddress(winner.wallet)}
              </span>
              <span className="text-right font-mono text-xs text-text-2">
                {formatWeiToEth(winner.entryWei, 3)} ETH in
              </span>
              <span className="text-right font-mono text-xs font-semibold text-gold">
                {formatWeiToEth(winner.ethWei, 4)} ETH
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {data?.rounds.length && !data.winners.length && !isLoading ? (
        <p className="px-1 py-4 text-xs text-text-2">
          No entries on the winning square in the latest settled round. The pool rolls over.
        </p>
      ) : null}

      {data?.rounds.slice(1).map((round) => (
        <div
          key={round.roundId.toString()}
          className="flex items-center justify-between gap-2 border-b border-white/5 px-1 py-2 text-xs text-text-2"
        >
          <span className="font-mono">Round #{round.roundId.toString()}</span>
          <span className="font-mono">Square {round.winningSquare}</span>
          <span className="font-mono">{formatWeiToEth(round.pool, 4)} ETH pool</span>
          {round.jackpotHit ? <span className="text-gold">Jackpot</span> : null}
        </div>
      ))}
    </section>
  )
}
