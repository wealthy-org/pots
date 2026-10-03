'use client'

import { useId } from 'react'
import { formatWeiToEth, parseEthToWei } from '@/lib/wei'

export function InputAmount({
  label,
  value,
  onValueChange,
  minWei,
  maxWei,
  disabled,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  minWei?: bigint
  maxWei?: bigint
  disabled?: boolean
}) {
  const id = useId()
  const errorId = `${id}-error`
  const parsed = parseEthToWei(value)
  let error: string | null = null
  if (value.trim().length > 0) {
    if (parsed === null) {
      error = 'Enter a valid ETH amount'
    } else if (minWei !== undefined && parsed < minWei) {
      error = `Minimum is ${formatWeiToEth(minWei)} ETH per block`
    } else if (maxWei !== undefined && maxWei > 0n && parsed > maxWei) {
      error = `Maximum is ${formatWeiToEth(maxWei)} ETH per block`
    }
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block px-1 text-[11px] font-semibold tracking-[0.2em] text-text-2 uppercase"
      >
        {label}
      </label>
      <div
        className={`flex h-[46px] items-center gap-2.5 rounded-md border bg-black/35 px-3 focus-within:border-gold/70 focus-within:ring-[3px] focus-within:ring-[rgba(232,194,122,0.08)] ${
          error ? 'border-loss' : 'border-line-2'
        }`}
      >
        <input
          id={id}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={disabled}
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-[17px] font-semibold outline-none"
        />
        <span className="text-xs font-medium text-text-2">ETH</span>
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 px-1 text-xs text-loss">
          {error}
        </p>
      ) : null}
    </div>
  )
}
