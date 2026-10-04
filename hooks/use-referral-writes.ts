'use client'

import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'
import { describeContractError } from '@/lib/errors'

/** `setReferrer`: tags the wallet once, before its first deploy (also serves a plan-only wallet). */
export function useReferralWrites() {
  const write = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data })
  const error = write.error ?? receipt.error
  return {
    setReferrer: (referrer: `0x${string}`) =>
      write.writeContract({
        address: managerAddress,
        abi: roundManagerAbi,
        functionName: 'setReferrer',
        args: [referrer],
      }),
    hash: write.data,
    isSubmitting: write.isPending,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    errorMessage: error ? describeContractError(error) : null,
    reset: write.reset,
  }
}
