'use client'

import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'
import { describeContractError } from '@/lib/errors'

export function usePotsWrites() {
  const write = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data })

  const error = write.error ?? receipt.error

  return {
    enter: (squares: number[], amountPerSquare: bigint) =>
      write.writeContract({
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'enter',
        args: [squares, amountPerSquare],
        value: BigInt(squares.length) * amountPerSquare,
      }),
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
    startNextRound: () =>
      write.writeContract({
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'startNextRound',
      }),
    hash: write.data,
    isSubmitting: write.isPending,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    error,
    errorMessage: error ? describeContractError(error) : null,
    reset: write.reset,
  }
}
