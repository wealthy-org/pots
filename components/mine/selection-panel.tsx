'use client'

import { Button } from '@/components/ui/button'
import { InputAmount } from '@/components/ui/input-amount'
import { PRESETS, PRESET_LABELS, type PresetName } from '@/lib/presets'
import { Phase, type RoundData } from '@/lib/types'
import { formatWeiToEth, multiplyWei, parseEthToWei } from '@/lib/wei'

const presetNames = Object.keys(PRESETS) as PresetName[]

export function SelectionPanel({
  selected,
  activePreset,
  onTogglePreset,
  amount,
  onAmountChange,
  minWei,
  maxWei,
  round,
  isConnected,
  paused,
  onConnect,
  onReview,
}: {
  selected: Set<number>
  activePreset: PresetName | null
  onTogglePreset: (name: PresetName) => void
  amount: string
  onAmountChange: (value: string) => void
  minWei?: bigint
  maxWei?: bigint
  round?: RoundData
  isConnected: boolean
  paused: boolean
  onConnect: () => void
  onReview: () => void
}) {
  const count = selected.size
  const parsed = parseEthToWei(amount)
  const amountValid =
    parsed !== null &&
    (minWei === undefined || parsed >= minWei) &&
    (maxWei === undefined || maxWei === 0n || parsed <= maxWei)
  const total = parsed !== null && count > 0 ? multiplyWei(parsed, count) : 0n

  const phaseAllowsEntry =
    round?.phase === Phase.OPEN || round?.phase === Phase.WAITING || round === undefined
  const canReview = isConnected && count > 0 && amountValid && phaseAllowsEntry && !paused

  let disabledReason: string | null = null
  if (paused) {
    disabledReason = 'New entries are paused'
  } else if (count === 0) {
    disabledReason = 'Select at least one square'
  } else if (!amountValid) {
    disabledReason = 'Enter a valid amount within the limits'
  } else if (!phaseAllowsEntry) {
    disabledReason = 'The round is not accepting entries'
  }

  return (
    <div className="flex flex-col gap-4">
      <section>
        <div className="flex items-start justify-between gap-3 px-1">
          <div>
            <h2 className="text-[11px] font-semibold tracking-[0.2em] text-text-2 uppercase">
              Strategy
            </h2>
            <p className="mt-1 text-[10px] text-text-3">
              Pick a preset pattern. Chosen squares light up on the grid.
            </p>
          </div>
          <span className="mt-2 font-mono text-[10px] text-text-3">{count}/25</span>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {presetNames.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={activePreset === name}
              onClick={() => onTogglePreset(name)}
              className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md border text-xs transition-colors ${
                activePreset === name
                  ? 'border-gold/80 bg-gold/10 text-gold-1'
                  : 'border-line-2 text-text-2 hover:border-white/30'
              }`}
            >
              <b className="font-mono text-xs font-medium">{PRESET_LABELS[name]}</b>
              <span className="font-mono text-[9px] text-text-3">
                {PRESETS[name].length} blocks
              </span>
            </button>
          ))}
        </div>
      </section>

      <InputAmount
        label="Amount per block"
        value={amount}
        onValueChange={onAmountChange}
        minWei={minWei}
        maxWei={maxWei}
      />

      <div className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between px-1 text-text-2">
          <span>Blocks</span>
          <span className="font-mono text-text">{count} selected</span>
        </div>
        <div className="flex justify-between px-1 text-text-2">
          <span>Total this round</span>
          <span className="font-mono text-text">{formatWeiToEth(total, 4)} ETH</span>
        </div>
      </div>

      {!isConnected ? (
        <Button size="lg" onClick={onConnect}>
          Connect wallet
        </Button>
      ) : (
        <Button size="lg" onClick={onReview} disabled={!canReview}>
          Review entry
          {count > 0 && amountValid ? (
            <span className="ml-1.5 font-mono text-xs opacity-70">
              {formatWeiToEth(total, 4)} ETH
            </span>
          ) : null}
        </Button>
      )}
      {isConnected && disabledReason ? (
        <p className="text-center text-[10px] text-text-3">{disabledReason}</p>
      ) : null}
    </div>
  )
}
