'use client'

import Link from 'next/link'
import { FooterLinks } from '@/components/layout/footer-links'
import { Button } from '@/components/ui/button'
import { PlanControls, PlanStatus, hasPlan, type AutoPlanView } from '@/components/mine/plan-panel'
import { InputAmount } from '@/components/ui/input-amount'
import { EthMark } from '@/components/ui/token-mark'
import { canEnterPhase } from '@/lib/entry-phase'
import { PRESETS, PRESET_LABELS, type PresetName } from '@/lib/presets'
import type { RoundData } from '@/lib/types'
import { formatWeiToEth, multiplyWei, parseEthToWei } from '@/lib/wei'

const presetNames = Object.keys(PRESETS) as PresetName[]

export type MineTab = 'auto' | 'manual'

function Stepper({
  count,
  onAll,
  onRemove,
  onAdd,
  disabled,
}: {
  count: number
  onAll: () => void
  onRemove: () => void
  onAdd: () => void
  disabled: boolean
}) {
  const btn =
    'grid h-9 min-w-9 place-items-center rounded-md border border-line-2 px-2 text-xs text-text-2 transition-colors hover:border-white/30 hover:text-text disabled:pointer-events-none disabled:opacity-50 max-md:min-h-11 max-md:min-w-11'
  return (
    <div className="flex items-center justify-between px-1">
      <span className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
        Blocks
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} onClick={onAll} disabled={disabled}>
          All
        </button>
        <button
          type="button"
          className={btn}
          onClick={onRemove}
          disabled={disabled || count === 0}
          aria-label="Remove block"
        >
          -
        </button>
        <span className="min-w-12 text-center font-mono text-sm">{count}/25</span>
        <button
          type="button"
          className={btn}
          onClick={onAdd}
          disabled={disabled || count === 25}
          aria-label="Add random block"
        >
          +
        </button>
      </div>
    </div>
  )
}

export function SelectionPanel({
  selected,
  activePreset,
  onTogglePreset,
  tab,
  onTabChange,
  onSelectAll,
  onRemoveLast,
  onAddRandom,
  amount,
  onAmountChange,
  minWei,
  maxWei,
  round,
  isConnected,
  paused,
  needsStart = false,
  roundClosed = false,
  revealing = false,
  walletAvailable = true,
  connectError = null,
  autoPlan,
  claims = [],
  onConnect,
  onReview,
}: {
  selected: Set<number>
  activePreset: PresetName | null
  onTogglePreset: (name: PresetName) => void
  tab: MineTab
  onTabChange: (tab: MineTab) => void
  onSelectAll: () => void
  onRemoveLast: () => void
  onAddRandom: () => void
  amount: string
  onAmountChange: (value: string) => void
  minWei?: bigint
  maxWei?: bigint
  round?: RoundData
  isConnected: boolean
  paused: boolean
  needsStart?: boolean
  /** The countdown ended and the keeper has not locked the round yet. */
  roundClosed?: boolean
  /** The grid is showing the winner of the round that just ended; entries wait until it is over. */
  revealing?: boolean
  /** False when no injected wallet exists, so Connect cannot work. */
  walletAvailable?: boolean
  connectError?: string | null
  /** The plan feature (v3). Absent means the Auto tab keeps presets only. */
  autoPlan?: AutoPlanView
  /** When something is claimable the primary button claims it (ADR-014, D-29). */
  claims?: Array<{ label: string; onClick: () => void; disabled: boolean }>
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

  /** The Auto tab runs a plan when the plan feature is on (the tab is otherwise presets only). */
  const planActive = Boolean(autoPlan) && tab === 'auto' && isConnected
  const planRunning = planActive && hasPlan(autoPlan?.plan)
  const phaseAllowsEntry = canEnterPhase(round?.phase, needsStart, roundClosed) && !revealing
  const canReview = isConnected && count > 0 && amountValid && phaseAllowsEntry && !paused

  let disabledReason: string | null = null
  if (paused) {
    disabledReason = 'New deploys are paused'
  } else if (roundClosed) {
    disabledReason = 'Round closed. The result comes next.'
  } else if (count === 0) {
    disabledReason = 'Select at least one block'
  } else if (!amountValid) {
    disabledReason = 'Enter a valid amount within the limits'
  } else if (revealing) {
    disabledReason = 'Revealing the winning block'
  } else if (!phaseAllowsEntry) {
    disabledReason = 'The round is not accepting deploys'
  }

  const modeClass = (active: boolean) =>
    `h-9 flex-1 rounded-md text-xs font-semibold transition-colors max-md:min-h-11 ${
      active ? 'bg-white/[0.07] text-text' : 'text-text-2 hover:text-text'
    }`

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Deploy mode"
        className="flex gap-1 rounded-lg border border-line p-1"
      >
        <button
          type="button"
          aria-pressed={tab === 'auto'}
          className={modeClass(tab === 'auto')}
          onClick={() => onTabChange('auto')}
        >
          Auto
        </button>
        <button
          type="button"
          aria-pressed={tab === 'manual'}
          className={modeClass(tab === 'manual')}
          onClick={() => onTabChange('manual')}
        >
          Manual
        </button>
      </div>

      {planRunning ? null : tab === 'auto' ? (
        <section>
          <div className="flex items-start justify-between gap-3 px-1">
            <div>
              <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
                Strategy
              </h2>
              <p className="mt-1 text-[10px] text-text-3">
                Pick a preset pattern. Chosen blocks light up on the grid.
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
                disabled={!phaseAllowsEntry}
                className={`flex min-h-12 disabled:cursor-not-allowed disabled:opacity-50 flex-col items-center justify-center gap-0.5 rounded-md border text-xs transition-colors ${
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
      ) : (
        <p className="px-1 text-xs text-text-2">
          Tap blocks on the grid to add or remove them from this round.
        </p>
      )}

      {planRunning ? null : (
        <section>
          <InputAmount
            label="Amount per block"
            value={amount}
            onValueChange={onAmountChange}
            minWei={minWei}
            maxWei={maxWei}
            disabled={!phaseAllowsEntry}
          />
          <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-text-3">
            <span>
              Min. amount per block is{' '}
              <span className="font-mono">
                {minWei !== undefined ? `${formatWeiToEth(minWei)} ETH` : '-'}
              </span>
            </span>
            <span>
              Per block{' '}
              <span className="font-mono">
                {count > 0 && parsed !== null ? `${formatWeiToEth(parsed, 5)} ETH` : '-'}
              </span>
            </span>
          </div>
        </section>
      )}

      {planRunning ? null : (
        <Stepper
          count={count}
          onAll={onSelectAll}
          onRemove={onRemoveLast}
          onAdd={onAddRandom}
          disabled={!phaseAllowsEntry}
        />
      )}

      {planActive ? (
        hasPlan(autoPlan?.plan) && autoPlan ? (
          <PlanStatus view={autoPlan} />
        ) : autoPlan ? (
          <PlanControls view={autoPlan} blocks={count} />
        ) : null
      ) : null}

      {planActive ? null : (
        <div className="flex flex-col gap-2 rounded-md border border-line p-3 text-sm">
          <div className="flex justify-between text-text-2">
            <span>Blocks</span>
            <span className="font-mono text-text">{count} selected</span>
          </div>
          <div className="flex justify-between text-text-2">
            <span>Total per round</span>
            <span className="font-mono text-text">{formatWeiToEth(total, 4)} ETH</span>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-semibold">
            <span>Total</span>
            <span className="flex items-center gap-1.5 font-mono">
              <EthMark className="h-3.5 w-3.5" />
              {formatWeiToEth(total, 4)} ETH
            </span>
          </div>
        </div>
      )}

      {!isConnected ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" className="uppercase" onClick={onConnect} disabled={!walletAvailable}>
            {walletAvailable ? 'Connect wallet' : 'No wallet detected'}
          </Button>
          {!walletAvailable ? (
            <p className="text-center text-xs text-text-2">
              Install MetaMask or Phantom (EVM) in this browser to deploy.
            </p>
          ) : null}
          {connectError ? (
            <p role="alert" className="text-center text-xs text-loss">
              {connectError}
            </p>
          ) : null}
        </div>
      ) : claims.length > 0 ? (
        <div className="flex flex-col gap-2">
          {claims.map((claim, index) => (
            <Button
              key={claim.label}
              size={index === 0 ? 'lg' : 'md'}
              variant={index === 0 ? 'primary' : 'secondary'}
              className="uppercase"
              onClick={claim.onClick}
              disabled={claim.disabled}
            >
              {claim.label}
            </Button>
          ))}
        </div>
      ) : planActive && autoPlan ? (
        hasPlan(autoPlan.plan) ? (
          <Button
            size="lg"
            variant="secondary"
            className="uppercase"
            onClick={autoPlan.onStop}
            disabled={autoPlan.busy}
          >
            Stop auto
            {autoPlan.plan && autoPlan.plan.balance > 0n ? (
              <span className="ml-1.5 font-mono text-xs opacity-70">
                {formatWeiToEth(autoPlan.plan.balance, 4)} ETH back
              </span>
            ) : null}
          </Button>
        ) : (
          <Button
            size="lg"
            variant="primary"
            className="uppercase"
            onClick={autoPlan.onStart}
            disabled={autoPlan.blockReason !== null || autoPlan.busy}
          >
            Start auto
            {autoPlan.blockReason === null ? (
              <span className="ml-1.5 font-mono text-xs opacity-70">
                {formatWeiToEth(autoPlan.deposit, 4)} ETH
              </span>
            ) : null}
          </Button>
        )
      ) : (
        <Button
          size="lg"
          variant="primary"
          className="uppercase"
          onClick={onReview}
          disabled={!canReview}
        >
          MINE
          {count > 0 && amountValid ? (
            <span className="ml-1.5 font-mono text-xs opacity-70">
              {formatWeiToEth(total, 4)} ETH
            </span>
          ) : null}
        </Button>
      )}
      {planActive &&
      claims.length === 0 &&
      autoPlan &&
      !hasPlan(autoPlan.plan) &&
      autoPlan.blockReason ? (
        <p className="text-center text-[10px] text-text-3">{autoPlan.blockReason}</p>
      ) : null}
      {isConnected && claims.length === 0 && !planActive && needsStart && canReview ? (
        <p className="text-center text-[10px] text-text-3">
          Starting the next round, then your deploy. Your wallet asks twice.
        </p>
      ) : null}
      {isConnected && claims.length === 0 && !planActive && disabledReason ? (
        <p className="text-center text-[10px] text-text-3">{disabledReason}</p>
      ) : null}

      <p className="text-center text-[11px] text-text-3">
        ETH deployed on blocks that do not win is not returned. Outcomes are random.
      </p>
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-text-2">
        <svg
          viewBox="0 0 14 14"
          className="h-3.5 w-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="5.6" />
          <path d="M7 6.2v3.4M7 4.3v.1" />
        </svg>
        Randomness from a commit-reveal oracle.{' '}
        <Link
          href="/fairness"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          How to verify
        </Link>
      </p>
      <FooterLinks />
    </div>
  )
}
