'use client'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import type { PlanData } from '@/hooks/use-plan'
import { autoPlanAddress } from '@/lib/contracts'
import { MAX_PLAN_ROUNDS, squaresFromMask } from '@/lib/plan-math'
import { formatWeiToEth } from '@/lib/wei'

const QUICK_ROUNDS = [5, 10, 25, 100]

const stepButton =
  'grid h-9 min-w-9 place-items-center rounded-md border border-line-2 px-2 text-xs text-text-2 transition-colors hover:border-white/30 hover:text-text disabled:pointer-events-none disabled:opacity-50 max-md:min-h-11 max-md:min-w-11'

export type AutoPlanView = {
  rounds: number
  onRoundsChange: (rounds: number) => void
  loop: boolean
  onLoopChange: (loop: boolean) => void
  /** The wallet's plan, when it has one (active or finished with a balance). */
  plan?: PlanData
  deposit: bigint
  minDeposit?: bigint
  /** Why a plan cannot start, or null. */
  blockReason: string | null
  busy: boolean
  onStart: () => void
  onStop: () => void
  onToggleLoop: (next: boolean) => void
}

export function hasPlan(plan?: PlanData): boolean {
  return plan !== undefined && (plan.active || plan.balance > 0n)
}

/** Switch with a visible label. A real button so it works with the keyboard and a screen reader. */
function Switch({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
  hint: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-1">
      <div>
        <p className="text-xs font-semibold text-text">{label}</p>
        <p className="mt-0.5 text-[11px] text-text-2">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="grid shrink-0 place-items-center disabled:opacity-50 max-md:min-h-11 max-md:min-w-12"
      >
        <span
          aria-hidden="true"
          className={`relative block h-6 w-11 rounded-full border transition-colors ${
            checked ? 'border-gold/70 bg-gold/20' : 'border-line-2 bg-bg'
          }`}
        >
          <span
            className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all ${
              checked ? 'left-5.5 bg-gold' : 'left-0.5 bg-text-2'
            }`}
          />
        </span>
      </button>
    </div>
  )
}

/** Rounds stepper, loop switch, and the cost of the plan, shown in the Auto tab. */
export function PlanControls({ view, blocks }: { view: AutoPlanView; blocks: number }) {
  const { rounds } = view
  return (
    <section className="flex flex-col gap-3" aria-label="Auto plan">
      <div className="px-1">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
          Auto plan
        </h2>
        <p className="mt-1 text-[11px] text-text-2">
          Deploys the same blocks in each of the next rounds. You pay the whole plan now and can
          take back what is unspent at any time.
        </p>
      </div>

      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
          Rounds
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={stepButton}
            onClick={() => view.onRoundsChange(Math.max(1, rounds - 1))}
            disabled={rounds <= 1}
            aria-label="Fewer rounds"
          >
            -
          </button>
          <span className="min-w-12 text-center font-mono text-sm" aria-live="polite">
            {rounds}
          </span>
          <button
            type="button"
            className={stepButton}
            onClick={() => view.onRoundsChange(Math.min(MAX_PLAN_ROUNDS, rounds + 1))}
            disabled={rounds >= MAX_PLAN_ROUNDS}
            aria-label="More rounds"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-1">
        {QUICK_ROUNDS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={rounds === value}
            onClick={() => view.onRoundsChange(value)}
            className={`min-h-11 rounded-md border px-3 font-mono text-xs transition-colors ${
              rounds === value
                ? 'border-gold/80 bg-gold/10 text-gold-1'
                : 'border-line-2 text-text-2 hover:border-white/30'
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <Switch
        checked={view.loop}
        onChange={view.onLoopChange}
        label="Loop rewards"
        hint="Moves your ETH winnings of the last round into the plan, so it keeps going while the balance covers one more round. Needs one extra confirmation."
      />

      <div className="flex flex-col gap-1.5 rounded-md border border-line p-3 text-sm">
        <div className="flex justify-between text-text-2">
          <span>Blocks per round</span>
          <span className="font-mono text-text">{blocks}</span>
        </div>
        <div className="flex justify-between text-text-2">
          <span>Rounds</span>
          <span className="font-mono text-text">{rounds}</span>
        </div>
        <div className="flex justify-between border-t border-line pt-1.5 font-semibold">
          <span>Pay now</span>
          <span className="font-mono">{formatWeiToEth(view.deposit, 5)} ETH</span>
        </div>
        {view.minDeposit !== undefined ? (
          <p className="text-[11px] text-text-3">
            Minimum plan: {formatWeiToEth(view.minDeposit, 5)} ETH
          </p>
        ) : null}
      </div>
    </section>
  )
}

/** The wallet's plan: what is left, and the controls to stop it or switch the loop. */
export function PlanStatus({ view }: { view: AutoPlanView }) {
  const plan = view.plan
  if (!plan) {
    return null
  }
  const blocks = squaresFromMask(plan.squareMask)
  const finished = !plan.active
  const perRound = BigInt(plan.squareCount) * plan.amountPerSquare
  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-line p-3"
      aria-label="Your auto plan"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
          Your auto plan
        </h2>
        <span
          className={`rounded-full border px-2 py-px text-[11px] font-semibold uppercase ${
            finished ? 'border-line-2 text-text-2' : 'border-gold/40 text-gold'
          }`}
        >
          {finished ? 'Finished' : 'Running'}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div>
          <dt className="text-[11px] text-text-3">Rounds left</dt>
          <dd className="font-mono">
            {plan.loop && plan.roundsRemaining === 0 ? 'While funded' : plan.roundsRemaining}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-text-3">Balance</dt>
          <dd className="font-mono">{formatWeiToEth(plan.balance, 5)} ETH</dd>
        </div>
        <div>
          <dt className="text-[11px] text-text-3">Per round</dt>
          <dd className="font-mono">{formatWeiToEth(perRound, 5)} ETH</dd>
        </div>
        <div>
          <dt className="text-[11px] text-text-3">Last round played</dt>
          <dd className="font-mono">{plan.lastRound > 0n ? `#${plan.lastRound}` : 'None yet'}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[11px] text-text-3">Blocks</dt>
          <dd className="font-mono break-words">{blocks.join(', ')}</dd>
        </div>
      </dl>
      {plan.active ? (
        <Switch
          checked={plan.loop}
          onChange={view.onToggleLoop}
          disabled={view.busy}
          label="Loop rewards"
          hint="Moves your winnings of the last round into the plan."
        />
      ) : (
        <p className="text-[11px] text-text-2">
          The plan has ended. Stop it to take back the {formatWeiToEth(plan.balance, 5)} ETH that is
          left.
        </p>
      )}
    </section>
  )
}

export function PlanReviewModal({
  open,
  onClose,
  onConfirm,
  squares,
  amountPerSquare,
  rounds,
  loop,
  needsConsent,
  deposit,
  minDeposit,
  isSubmitting,
  errorMessage,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  squares: number[]
  amountPerSquare: bigint
  rounds: number
  loop: boolean
  needsConsent: boolean
  deposit: bigint
  minDeposit?: bigint
  isSubmitting: boolean
  errorMessage: string | null
}) {
  return (
    <Modal open={open} onClose={onClose} title="Review auto plan">
      <div className="flex flex-col gap-2.5 text-sm">
        <Row label="Blocks" value={squares.length ? squares.join(', ') : '-'} />
        <Row label="Amount per block" value={`${formatWeiToEth(amountPerSquare, 5)} ETH`} />
        <Row label="Rounds" value={String(rounds)} />
        <Row label="Loop rewards" value={loop ? 'On' : 'Off'} />
        <Row label="Pay now" value={`${formatWeiToEth(deposit, 5)} ETH`} strong />
        {minDeposit !== undefined ? (
          <Row label="Minimum plan" value={`${formatWeiToEth(minDeposit, 5)} ETH`} />
        ) : null}
        <Row label="Contract" value={autoPlanAddress ?? '-'} mono />
      </div>
      {loop && needsConsent ? (
        <p className="mt-4 text-xs text-gold">
          Loop needs your permission first, so your wallet asks for two confirmations: the
          permission, then the plan.
        </p>
      ) : null}
      <p className="mt-4 text-xs text-text-2">
        The plan deploys the same blocks in each round until the rounds run out, and you can stop it
        at any time to take back the unspent ETH. ETH deployed on blocks that do not win is not
        returned. Outcomes are random and the return can be lower than what you deploy. While a plan
        runs, the scheduler opens each round, so a round can start a few seconds after the last one.
      </p>
      {errorMessage ? (
        <p role="alert" className="mt-2 text-xs text-loss">
          {errorMessage}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={isSubmitting || squares.length === 0}>
          {isSubmitting ? 'Confirming...' : 'Confirm in wallet'}
        </Button>
      </div>
    </Modal>
  )
}

function Row({
  label,
  value,
  strong,
  mono,
}: {
  label: string
  value: string
  strong?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-text-2">{label}</span>
      <span
        className={`max-w-[60%] text-right ${mono ? 'font-mono text-xs break-all' : ''} ${strong ? 'font-semibold' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}
