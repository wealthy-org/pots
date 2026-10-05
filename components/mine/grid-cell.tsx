import type { KeyboardEvent } from 'react'
import { formatWeiToEth } from '@/lib/wei'

export type GridCellData = {
  id: number
  total: bigint | null
  miners: number | null
  selected: boolean
  /** 0 to 1, the block's ETH relative to the busiest block. */
  heat?: number
  you?: bigint | null
  scan?: boolean
  win?: boolean
  /** Dimmed while the reveal shows the winning block, like the prototype. */
  dim?: boolean
}

export function GridCell({
  id,
  total,
  miners,
  selected,
  heat = 0,
  you,
  scan,
  win,
  dim,
  disabled,
  tabIndex,
  onToggle,
  onFocus,
  onKeyDown,
  buttonRef,
}: GridCellData & {
  disabled?: boolean
  tabIndex: number
  onToggle?: (id: number) => void
  onFocus?: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
  buttonRef?: (element: HTMLButtonElement | null) => void
}) {
  // The scan block glows, and the winner glows and grows about 6%, raised above its neighbors so the
  // glow and the growth are not hidden (owner request 2026-10-05, SD-17).
  const stateClass = win
    ? 'z-10 scale-[1.06] border-gold-1 bg-[linear-gradient(150deg,var(--gold-1),var(--gold-2)_55%,var(--gold-3))] text-gold-ink shadow-[0_0_30px_4px_rgba(232,194,122,0.6)]'
    : scan
      ? 'z-10 border-gold-1 shadow-[0_0_24px_3px_rgba(232,194,122,0.55)]'
      : selected
        ? 'border-gold/60 bg-[linear-gradient(180deg,#1a1610,#110f0b)] shadow-[inset_0_0_0_1px_rgba(232,194,122,0.25)]'
        : 'border-line hover:border-line-2'

  // The scan and the winner stay bright while the rest of the grid is locked.
  const disabledOpacity =
    win || scan ? 'disabled:opacity-100' : dim ? 'disabled:opacity-30' : 'disabled:opacity-60'

  const label = `Block ${id}${total !== null ? `, ${formatWeiToEth(total, 5)} ETH deployed` : ''}${
    miners !== null ? `, ${miners} ${miners === 1 ? 'miner' : 'miners'}` : ''
  }${you && you > 0n ? `, you ${formatWeiToEth(you, 3)} ETH` : ''}${selected ? ', selected' : ''}${win ? ', winning block' : ''}`

  return (
    <button
      ref={buttonRef}
      type="button"
      tabIndex={tabIndex}
      aria-pressed={selected}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle ? () => onToggle(id) : undefined}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={`relative flex aspect-square flex-col justify-between overflow-hidden rounded border p-2 text-left motion-safe:transition-[transform,box-shadow,border-color,background-color] disabled:cursor-default max-md:p-1.5 ${disabledOpacity} ${stateClass}`}
    >
      {heat > 0 && !win ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 bg-gold/[0.12]"
          style={{ height: `${Math.round(heat * 90)}%` }}
        />
      ) : null}
      <span className="relative flex items-start justify-between text-[11px] text-text-2">
        <span className={win ? 'text-gold-ink/65' : selected ? 'text-gold' : ''}>#{id}</span>
        {miners !== null ? (
          <span className={`font-mono ${win ? 'text-gold-ink/65' : ''}`}>{miners}</span>
        ) : null}
      </span>
      <span className="relative flex flex-col items-end">
        <span
          className={`font-mono text-[13px] font-semibold max-md:text-[10.5px] ${win ? 'text-gold-ink' : 'text-white'}`}
        >
          {total !== null ? formatWeiToEth(total, 5) : '-'}
        </span>
        {you && you > 0n ? (
          <>
            <span
              className={`font-mono text-[10px] max-md:hidden ${win ? 'text-gold-ink' : 'text-gold'}`}
            >
              you {formatWeiToEth(you, 3)}
            </span>
            <span
              aria-hidden="true"
              className={`hidden h-1.5 w-1.5 rounded-full max-md:block ${win ? 'bg-gold-ink' : 'bg-gold'}`}
            />
          </>
        ) : null}
      </span>
    </button>
  )
}
