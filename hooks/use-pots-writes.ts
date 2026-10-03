'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useConfig, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { readContract, waitForTransactionReceipt } from 'wagmi/actions'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'
import { describeContractError } from '@/lib/errors'
import { Phase, type RoundData } from '@/lib/types'

const START_RECEIPT_TIMEOUT_MS = 60_000

export function usePotsWrites() {
  const config = useConfig()
  const write = useWriteContract()
  const startWrite = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data })
  const [isStarting, setIsStarting] = useState(false)
  const [flowError, setFlowError] = useState<unknown>(null)
  const busy = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const error = write.error ?? receipt.error ?? startWrite.error ?? flowError
  const { reset: resetWrite } = write
  const { reset: resetStart } = startWrite
  const reset = useCallback(() => {
    resetWrite()
    resetStart()
    setFlowError(null)
  }, [resetWrite, resetStart])

  /** True when the chain says the next round has not been started yet (ADR-014). */
  async function nextRoundNeedsStart(): Promise<boolean> {
    const roundId = (await readContract(config, {
      address: managerAddress,
      abi: roundManagerAbi,
      functionName: 'currentRoundId',
    })) as bigint
    if (roundId === 0n) {
      return true
    }
    const round = (await readContract(config, {
      address: managerAddress,
      abi: roundManagerAbi,
      functionName: 'getRound',
      args: [roundId],
    })) as RoundData
    return round.phase === Phase.SETTLED || round.phase === Phase.CANCELLED
  }

  return {
    /**
     * Sends the deploy, and first the start of the next round when the keeper has not started it
     * yet (two wallet confirmations). The chain is read at confirmation time, so a keeper that
     * started the round in the meantime does not cause a second start, and a start that fails
     * because the keeper won the race is followed by the deploy.
     */
    enterAndStart: async (squares: number[], amountPerSquare: bigint) => {
      if (busy.current) {
        return
      }
      busy.current = true
      setFlowError(null)
      startWrite.reset()
      setIsStarting(true)
      try {
        try {
          if (await nextRoundNeedsStart()) {
            const hash = await startWrite.writeContractAsync({
              address: managerAddress,
              abi: roundManagerAbi,
              functionName: 'startNextRound',
            })
            await waitForTransactionReceipt(config, { hash, timeout: START_RECEIPT_TIMEOUT_MS })
          }
        } catch (startError) {
          // The keeper may have started the round while the wallet was open: check again.
          let stillNeeded = true
          try {
            stillNeeded = await nextRoundNeedsStart()
          } catch {
            stillNeeded = true
          }
          if (stillNeeded) {
            if (mounted.current) {
              setFlowError(startError)
            }
            return
          }
          // The keeper won the race, so the earlier start error no longer applies.
          startWrite.reset()
        }
        if (!mounted.current) {
          return
        }
        write.writeContract({
          address: managerAddress,
          abi: roundManagerAbi,
          functionName: 'enter',
          args: [squares, amountPerSquare],
          value: BigInt(squares.length) * amountPerSquare,
        })
      } finally {
        busy.current = false
        if (mounted.current) {
          setIsStarting(false)
        }
      }
    },
    claimEth: (roundId: bigint) =>
      write.writeContract({
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'claimEth',
        args: [roundId],
      }),
    claimPots: (roundId: bigint) =>
      write.writeContract({
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'claimPots',
        args: [roundId],
      }),
    lock: () =>
      write.writeContract({ address: managerAddress, abi: roundManagerAbi, functionName: 'lock' }),
    requestRandomness: () =>
      write.writeContract({
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'requestRandomness',
      }),
    settle: (roundId: bigint) =>
      write.writeContract({
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'settle',
        args: [roundId],
      }),
    refundRandomness: (roundId: bigint) =>
      write.writeContract({
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'refundRandomness',
        args: [roundId],
      }),
    cancelRound: (roundId: bigint) =>
      write.writeContract({
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'cancelRound',
        args: [roundId],
      }),
    hash: write.data,
    isSubmitting: write.isPending || startWrite.isPending || isStarting,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    error,
    errorMessage: error ? describeContractError(error) : null,
    reset,
  }
}
