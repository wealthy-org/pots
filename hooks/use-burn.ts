'use client'

import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { potsTokenAbi, tokenAddress } from '@/lib/contracts'
import { describeContractError } from '@/lib/errors'

/** `burn(amount)` on the POTS token (v3, ERC20Burnable). Burning lowers supply, not `totalMinted`. */
export function useBurn() {
  const write = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data })
  const error = write.error ?? receipt.error
  return {
    burn: (amount: bigint) =>
      write.writeContract({
        address: tokenAddress,
        abi: potsTokenAbi,
        functionName: 'burn',
        args: [amount],
      }),
    hash: write.data,
    isSubmitting: write.isPending,
    isConfirming: receipt.isLoading,
    isConfirmed: receipt.isSuccess,
    errorMessage: error ? describeContractError(error) : null,
    reset: write.reset,
  }
}
