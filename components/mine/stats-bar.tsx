'use client'

import { useCountdown, formatCountdown } from '@/hooks/use-countdown'
import { formatWeiToEth } from '@/lib/wei'
import { Phase, phaseLabel, type RoundData } from '@/lib/types'

export function StatsBar({
  roundId,
  round,
  balances,
}: {
  roundId?: bigint
  round?: RoundData
  balances?: readonly [bigint, bigint, bigint]
}) {
  const countdown = useCountdown(round?.closeAt)
  const isOpen = round?.phase === Phase.OPEN

  return (
    <div className="grid grid-cols-3 items-center rounded-md border border-line bg-bg-elev py-2">
      <div className="grid justify-items-center gap-1 px-1 text-center">
        <span className="text-[9px] font-semibold tracking-[0.12em] text-gold/80 uppercase">
          Total deployed
        </span>
        <span className="font-mono text-base font-semibold">
          {round ? formatWeiToEth(round.totalEth, 4) : '0'} ETH
        </span>
        <span className="text-[9px] tracking-[0.12em] text-text-2 uppercase">
          {round ? phaseLabel(round.phase) : 'No round'}
        </span>
      </div>
      <div className="grid justify-items-center gap-1 border-x border-line px-1 text-center">
        <span className="text-[10px] font-semibold tracking-[0.16em] text-gold/80 uppercase">
          Jackpot
        </span>
        <span className="font-mono text-base font-semibold text-gold">
          {balances ? formatWeiToEth(balances[1], 4) : '0'} ETH
        </span>
        <span className="text-[9px] tracking-[0.12em] text-gold/55 uppercase">
          Protocol balance
        </span>
      </div>
      <div className="grid justify-items-center gap-1 px-1 text-center">
        <span className="text-[9px] font-semibold tracking-[0.12em] text-gold/80 uppercase">
          Round #{roundId !== undefined ? roundId.toString() : '-'}
        </span>
        <span
          className={`font-mono text-base font-semibold ${isOpen && countdown <= 5 ? 'text-gold' : ''}`}
        >
          {isOpen ? formatCountdown(countdown) : round ? phaseLabel(round.phase) : '--:--'}
        </span>
        <span className="text-[9px] tracking-[0.12em] text-text-2 uppercase">
          {isOpen ? 'Time left' : 'Status'}
        </span>
      </div>
    </div>
  )
}
