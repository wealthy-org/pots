'use client'

import { useMemo } from 'react'
import { encodeFunctionData, type Address } from 'viem'
import { useAccount, useEstimateFeesPerGas, useEstimateGas } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'
import { formatWeiToEth } from '@/lib/wei'

export function ReviewModal({
  open,
  onClose,
  onConfirm,
  roundId,
  needsStart = false,
  closeAt,
  squares,
  amountPerSquare,
  totalWei,
  referrer,
  isSubmitting,
  errorMessage,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  roundId?: bigint
  needsStart?: boolean
  closeAt?: bigint
  squares: number[]
  amountPerSquare: bigint
  totalWei: bigint
  /** A referrer the first deploy is tagged with (v3 link), or undefined. */
  referrer?: Address
  isSubmitting: boolean
  errorMessage: string | null
}) {
  const { address } = useAccount()

  // Calldata is built only while the dialog is open, so a closed dialog does no work per render.
  const enterData = useMemo(
    () =>
      open && squares.length > 0
        ? referrer
          ? encodeFunctionData({
              abi: roundManagerAbi,
              functionName: 'enterWithReferrer',
              args: [referrer, squares, amountPerSquare],
            })
          : encodeFunctionData({
              abi: roundManagerAbi,
              functionName: 'enter',
              args: [squares, amountPerSquare],
            })
        : undefined,
    [open, squares, amountPerSquare, referrer],
  )
  const startData = useMemo(
    () =>
      open && needsStart
        ? encodeFunctionData({ abi: roundManagerAbi, functionName: 'startNextRound' })
        : undefined,
    [open, needsStart],
  )

  const gas = useEstimateGas({
    account: address,
    to: managerAddress,
    value: totalWei,
    data: enterData,
    query: { enabled: enterData !== undefined && totalWei > 0n && !needsStart },
  })
  // The deploy cannot be estimated before the round exists, so only the start step is estimated.
  const startGas = useEstimateGas({
    account: address,
    to: managerAddress,
    data: startData,
    query: { enabled: startData !== undefined },
  })

  const fees = useEstimateFeesPerGas()
  const feePerGas = fees.data?.maxFeePerGas ?? fees.data?.gasPrice
  const estimatedFee = gas.data && feePerGas ? gas.data * feePerGas : undefined
  const startFee = startGas.data && feePerGas ? startGas.data * feePerGas : undefined
  const deadline =
    closeAt && closeAt > 0n
      ? new Date(Number(closeAt) * 1000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Set on first deploy'

  return (
    <Modal open={open} onClose={onClose} title="Review deploy">
      <div className="flex flex-col gap-2.5 text-sm">
        <Row label="Round" value={roundId !== undefined ? `#${roundId.toString()}` : '-'} />
        <Row label="Deadline" value={deadline} />
        <Row label="Blocks" value={squares.length ? squares.join(', ') : '-'} />
        <Row label="Amount per block" value={`${formatWeiToEth(amountPerSquare, 5)} ETH`} />
        <Row label="Total" value={`${formatWeiToEth(totalWei, 5)} ETH`} strong />
        <Row label="Contract" value={managerAddress} mono />
        {referrer ? <Row label="Referred by" value={referrer} mono /> : null}
        <Row
          label="Estimated network fee"
          value={
            needsStart
              ? startFee !== undefined
                ? `Start ${formatWeiToEth(startFee, 8)} ETH, plus the deploy fee shown by your wallet`
                : 'Estimating the start step...'
              : estimatedFee !== undefined
                ? `${formatWeiToEth(estimatedFee, 8)} ETH`
                : 'Estimating...'
          }
        />
      </div>

      {needsStart ? (
        <p className="mt-4 text-xs text-gold">
          The next round starts first, so your wallet asks for two confirmations: one to start the
          round, then one for your deploy.
        </p>
      ) : null}
      {referrer ? (
        <p className="mt-4 text-xs text-text-2">
          This first deploy also sets your referrer for good: it cannot be changed later. The
          referrer earns a 1% POTS bonus on your POTS claims, minted on top of your reward, and it
          costs you nothing.
        </p>
      ) : null}
      <p className="mt-4 text-xs text-text-2">
        ETH deployed on blocks that do not win is not returned. Outcomes are random and the return
        can be lower than the deploy.
      </p>
      {squares.length === 25 ? (
        <p className="mt-2 text-xs text-gold">
          All 25 blocks selected: eligibility on the winning block is certain, but the ETH return is
          not guaranteed to exceed the deploy and fee.
        </p>
      ) : null}
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
