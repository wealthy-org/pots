'use client'

import { useEffect, useId, useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Panel } from '@/components/ui/panel'
import { useBurn } from '@/hooks/use-burn'
import { potsTokenAbi, tokenAddress } from '@/lib/contracts'
import { formatWeiToEth, parseEthToWei } from '@/lib/wei'

/**
 * Burns POTS from the connected wallet (v3). The panel shows the effect before it asks: the supply
 * falls, the amount ever minted stays, and the cap is counted on the amount ever minted.
 */
export function BurnPanel({
  totalSupply,
  totalMinted,
  onBurned,
}: {
  totalSupply?: bigint
  totalMinted?: bigint
  onBurned: () => void
}) {
  const { address, isConnected } = useAccount()
  const inputId = useId()
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const burn = useBurn()
  const balance = useReadContract({
    address: tokenAddress,
    abi: potsTokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  })

  const held = balance.data as bigint | undefined
  const amount = parseEthToWei(value)
  const tooMuch = amount !== null && held !== undefined && amount > held
  const valid = amount !== null && amount > 0n && !tooMuch
  const supplyAfter =
    valid && totalSupply !== undefined && amount <= totalSupply ? totalSupply - amount : undefined

  const { isConfirmed, reset } = burn
  const { refetch: refetchBalance } = balance
  /* eslint-disable react-hooks/set-state-in-effect -- a confirmed burn closes the dialog and clears the amount */
  useEffect(() => {
    if (isConfirmed) {
      setOpen(false)
      setValue('')
      void refetchBalance()
      onBurned()
      reset()
    }
  }, [isConfirmed, refetchBalance, onBurned, reset])
  /* eslint-enable react-hooks/set-state-in-effect */

  let hint = 'Burning is permanent. Burned POTS cannot be recovered or minted again.'
  let hintTone = 'text-text-2'
  if (value.length > 0 && amount === null) {
    hint = 'Enter a valid POTS amount.'
    hintTone = 'text-loss'
  } else if (tooMuch) {
    hint = 'That is more than your POTS balance.'
    hintTone = 'text-loss'
  }

  return (
    <Panel>
      <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">Burn</h2>
      {!isConnected ? (
        <p className="mt-2 text-xs text-text-2">Connect a wallet to burn POTS you hold.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          <p className="text-xs text-text-2">
            Your balance:{' '}
            <span className="font-mono text-text">
              {held !== undefined ? `${formatWeiToEth(held, 4)} POTS` : '...'}
            </span>
          </p>
          <div>
            <label
              htmlFor={inputId}
              className="mb-1.5 block text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase"
            >
              Amount to burn
            </label>
            <div className="flex gap-2">
              <input
                id={inputId}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.0"
                aria-invalid={tooMuch || (value.length > 0 && amount === null)}
                aria-describedby={`${inputId}-hint`}
                className="min-h-11 min-w-0 flex-1 rounded-md border border-line-2 bg-bg px-3 font-mono text-sm outline-none focus-visible:border-gold"
              />
              <Button
                variant="secondary"
                disabled={held === undefined || held === 0n}
                onClick={() => held !== undefined && setValue(formatWeiToEth(held, 18))}
              >
                Max
              </Button>
            </div>
            <p id={`${inputId}-hint`} className={`mt-1.5 text-xs ${hintTone}`}>
              {hint}
            </p>
          </div>
          {valid ? (
            <dl className="grid gap-1 text-xs text-text-2">
              <div className="flex justify-between gap-3">
                <dt>Total supply after</dt>
                <dd className="font-mono text-text">
                  {supplyAfter !== undefined ? `${formatWeiToEth(supplyAfter, 4)} POTS` : '...'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Total ever minted</dt>
                <dd className="font-mono text-text">
                  {totalMinted !== undefined ? `${formatWeiToEth(totalMinted, 4)} POTS` : '...'} (no
                  change)
                </dd>
              </div>
            </dl>
          ) : null}
          <div>
            <Button
              disabled={!valid}
              onClick={() => {
                burn.reset()
                setOpen(true)
              }}
            >
              Burn POTS
            </Button>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Confirm burn">
        <div className="flex flex-col gap-2.5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-text-2">Amount</span>
            <span className="font-mono font-semibold">
              {amount !== null ? `${formatWeiToEth(amount, 4)} POTS` : '-'}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-text-2">Contract</span>
            <span className="max-w-[60%] text-right font-mono text-xs break-all">
              {tokenAddress}
            </span>
          </div>
        </div>
        <p className="mt-4 text-xs text-text-2">
          This destroys the POTS for good. It lowers the total supply, not the amount ever minted,
          and it does not give anything back.
        </p>
        {burn.errorMessage ? (
          <p role="alert" className="mt-2 text-xs text-loss">
            {burn.errorMessage}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={burn.isSubmitting || burn.isConfirming}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!valid || burn.isSubmitting || burn.isConfirming}
            onClick={() => amount !== null && burn.burn(amount)}
          >
            {burn.isSubmitting || burn.isConfirming ? 'Confirming...' : 'Burn in wallet'}
          </Button>
        </div>
      </Modal>
    </Panel>
  )
}
