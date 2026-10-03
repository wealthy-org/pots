'use client'

import { SegmentTimer } from '@/components/mine/segment-timer'
import { EthMark } from '@/components/ui/token-mark'
import { formatCountdown, useCountdown } from '@/hooks/use-countdown'
import { Phase, type RoundData } from '@/lib/types'
import { formatWeiToEth } from '@/lib/wei'

/** Timer text and its sub label for each phase. The keeper runs once a minute, so a round takes about 1.5 minutes to settle (L-113). */
function timerText(
  round: RoundData | undefined,
  remaining: number,
): { main: string; sub: string; warn: boolean; clock: boolean } {
  switch (round?.phase) {
    case Phase.OPEN:
      return remaining > 0
        ? { main: formatCountdown(remaining), sub: 'Time left', warn: remaining <= 5, clock: true }
        : { main: 'Round closed', sub: 'Result in about 2 minutes', warn: false, clock: false }
    case Phase.LOCKED:
      return { main: 'Round closed', sub: 'Result in about 2 minutes', warn: false, clock: false }
    case Phase.RANDOMNESS_PENDING:
      return { main: 'Revealing...', sub: 'Randomness status', warn: false, clock: false }
    case Phase.SETTLED:
      return {
        main: `Winning block: ${round.winningSquare}`,
        sub: 'Randomness revealed',
        warn: false,
        clock: false,
      }
    case Phase.CANCELLED:
      return { main: 'Round cancelled', sub: 'Deploys refunded', warn: false, clock: false }
    default:
      return { main: 'Waiting for the first deploy', sub: 'Next round', warn: false, clock: false }
  }
}

export function PanelStats({
  roundId,
  round,
  jackpotWei,
  miners,
  roundsAgo,
  windowSeconds,
}: {
  roundId?: bigint
  round?: RoundData
  jackpotWei?: bigint
  miners: number | null
  /** Rounds since the last jackpot hit; shown only when the indexer provides it. */
  roundsAgo?: number | null
  windowSeconds?: number
}) {
  const remaining = useCountdown(round?.closeAt)
  const text = timerText(round, remaining)
  const open = round?.phase === Phase.OPEN && remaining > 0

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 items-center rounded-md border border-line bg-bg-elev py-2">
        <div className="grid justify-items-center gap-1 px-1 text-center">
          <span className="text-[9px] font-semibold tracking-[0.12em] text-gold/80 uppercase">
            {miners === null ? '- miners' : `${miners} ${miners === 1 ? 'miner' : 'miners'}`}
          </span>
          <span className="flex items-center gap-1 font-mono text-base font-semibold">
            <EthMark className="h-3.5 w-3.5" />
            {round ? formatWeiToEth(round.totalEth, 4) : '-'}
          </span>
          <span className="text-[9px] tracking-[0.12em] text-text-2 uppercase">Total deployed</span>
        </div>
        <div className="grid justify-items-center gap-1 border-x border-line px-1 text-center">
          <span className="text-[11px] font-semibold tracking-[0.16em] text-gold/80 uppercase">
            Jackpot
          </span>
          <span className="font-mono text-base font-semibold text-gold">
            {jackpotWei !== undefined ? formatWeiToEth(jackpotWei, 4) : '-'}
            <small className="ml-1 text-[10px] font-medium text-gold/70">ETH</small>
          </span>
          <span className="text-[9px] tracking-[0.12em] text-gold/70 uppercase">
            {roundsAgo === undefined || roundsAgo === null || roundsAgo < 0
              ? 'Current jackpot'
              : roundsAgo === 0
                ? 'Hit this round'
                : `${roundsAgo}  ago`}
          </span>
        </div>
        <div className="grid justify-items-center gap-1 px-1 text-center">
          <span className="text-[9px] font-semibold tracking-[0.12em] text-gold/80 uppercase">
            Round #{roundId !== undefined ? roundId.toString() : '-'}
          </span>
          <span
            className={`leading-tight font-semibold ${text.clock ? 'font-mono text-base' : 'text-xs'} ${text.warn ? 'text-gold' : ''}`}
          >
            {text.main}
          </span>
          <span className="text-[9px] tracking-[0.12em] text-text-2 uppercase">{text.sub}</span>
        </div>
      </div>
      <SegmentTimer
        remaining={remaining}
        windowSeconds={windowSeconds}
        open={open}
        revealing={round?.phase === Phase.RANDOMNESS_PENDING}
      />
    </div>
  )
}
