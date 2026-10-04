'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfig, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { waitForTransactionReceipt } from 'wagmi/actions'
import { autoPlanAbi, autoPlanAddress, managerAddress, roundManagerAbi } from '@/lib/contracts'
import { describeContractError } from '@/lib/errors'
import { planDeposit } from '@/lib/plan-math'

const STEP_RECEIPT_TIMEOUT_MS = 60_000

/**
 * Plan writes. Loop needs the wallet's consent on the manager first, so a plan with loop is two
 * wallet confirmations: the consent, then the plan call. A rejected first step sends nothing.
 */
export function usePlanWrites() {
  const config = useConfig()
  const write = useWriteContract()
  const consentWrite = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data })
  const [isPreparing, setIsPreparing] = useState(false)
  const [flowError, setFlowError] = useState<unknown>(null)
  const busy = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const { reset: resetWrite } = write
  const { reset: resetConsent } = consentWrite
  const reset = useCallback(() => {
    resetWrite()
    resetConsent()
    setFlowError(null)
  }, [resetWrite, resetConsent])

  /** Sends the consent and waits for it. Returns false when it failed (the error is kept). */
  const ensureConsent = useCallback(
    async (hasConsent: boolean | undefined): Promise<boolean> => {
      if (hasConsent) {
        return true
      }
      try {
        const hash = await consentWrite.writeContractAsync({
          address: managerAddress,
          abi: roundManagerAbi,
          functionName: 'setPlanClaimConsent',
          args: [true],
        })
        await waitForTransactionReceipt(config, { hash, timeout: STEP_RECEIPT_TIMEOUT_MS })
        return true
      } catch (error) {
        if (mounted.current) {
          setFlowError(error)
        }
        return false
      }
    },
    [config, consentWrite],
  )

  const run = useCallback(async (work: () => Promise<void>) => {
    if (busy.current) {
      return
    }
    busy.current = true
    setFlowError(null)
    setIsPreparing(true)
    try {
      await work()
    } finally {
      busy.current = false
      if (mounted.current) {
        setIsPreparing(false)
      }
    }
  }, [])

  const error = write.error ?? receipt.error ?? consentWrite.error ?? flowError

  return {
    createPlan: (input: {
      squares: number[]
      amountPerSquare: bigint
      rounds: number
      loop: boolean
      hasConsent: boolean | undefined
    }) =>
      run(async () => {
        if (autoPlanAddress === undefined) {
          return
        }
        if (input.loop && !(await ensureConsent(input.hasConsent))) {
          return
        }
        if (!mounted.current) {
          return
        }
        write.writeContract({
          address: autoPlanAddress,
          abi: autoPlanAbi,
          functionName: 'createPlan',
          args: [input.squares, input.amountPerSquare, input.rounds, input.loop],
          value: planDeposit(input.rounds, input.squares.length, input.amountPerSquare),
        })
      }),
    cancelPlan: () =>
      run(async () => {
        if (autoPlanAddress === undefined) {
          return
        }
        write.writeContract({
          address: autoPlanAddress,
          abi: autoPlanAbi,
          functionName: 'cancelPlan',
        })
      }),
    setLoop: (loop: boolean, hasConsent: boolean | undefined) =>
      run(async () => {
        if (autoPlanAddress === undefined) {
          return
        }
        if (loop && !(await ensureConsent(hasConsent))) {
          return
        }
        if (!mounted.current) {
          return
        }
        write.writeContract({
          address: autoPlanAddress,
          abi: autoPlanAbi,
          functionName: 'setLoop',
          args: [loop],
        })
      }),
    hash: write.data,
    isSubmitting: write.isPending || consentWrite.isPending || isPreparing,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    error,
    errorMessage: error ? describeContractError(error) : null,
    reset,
  }
}
