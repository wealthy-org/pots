'use client'

import { useMemo } from 'react'
import { useReadContracts } from 'wagmi'
import {
  autoPlanAbi,
  autoPlanAddress,
  autoPlanEnabled,
  managerAddress,
  roundManagerAbi,
} from '@/lib/contracts'

export type PlanData = {
  squareMask: number
  squareCount: number
  amountPerSquare: bigint
  roundsRemaining: number
  loop: boolean
  active: boolean
  lastRound: bigint
  balance: bigint
}

const PLAN_REFETCH_MS = 8000

/** What the plan panel needs from the chain. Everything is undefined while the feature is off. */
export function usePlan(wallet?: `0x${string}`) {
  const enabled = autoPlanEnabled && autoPlanAddress !== undefined
  const result = useReadContracts({
    contracts: enabled
      ? [
          {
            address: autoPlanAddress,
            abi: autoPlanAbi,
            functionName: 'getPlan',
            args: wallet ? [wallet] : undefined,
          },
          { address: autoPlanAddress, abi: autoPlanAbi, functionName: 'activePlanCount' },
          { address: autoPlanAddress, abi: autoPlanAbi, functionName: 'maxActivePlans' },
          { address: autoPlanAddress, abi: autoPlanAbi, functionName: 'minPlanDeposit' },
          { address: managerAddress, abi: roundManagerAbi, functionName: 'planContract' },
          {
            address: managerAddress,
            abi: roundManagerAbi,
            functionName: 'planClaimConsent',
            args: wallet ? [wallet] : undefined,
          },
        ]
      : [],
    query: { enabled, refetchInterval: PLAN_REFETCH_MS },
  })

  return useMemo(() => {
    const data = result.data
    const value = (index: number): unknown =>
      data?.[index]?.status === 'success' ? data[index].result : undefined
    const raw = wallet ? (value(0) as Record<string, unknown> | undefined) : undefined
    const plan: PlanData | undefined = raw
      ? {
          squareMask: Number(raw.squareMask),
          squareCount: Number(raw.squareCount),
          amountPerSquare: raw.amountPerSquare as bigint,
          roundsRemaining: Number(raw.roundsRemaining),
          loop: Boolean(raw.loop),
          active: Boolean(raw.active),
          lastRound: raw.lastRound as bigint,
          balance: raw.balance as bigint,
        }
      : undefined
    const registeredPlan = value(4) as string | undefined
    return {
      enabled,
      plan,
      activeCount: value(1) as bigint | undefined,
      maxActive: value(2) as bigint | undefined,
      minDeposit: value(3) as bigint | undefined,
      registered:
        registeredPlan !== undefined &&
        autoPlanAddress !== undefined &&
        registeredPlan.toLowerCase() === autoPlanAddress.toLowerCase(),
      consent: value(5) as boolean | undefined,
      isLoading: result.isLoading,
      isError: result.isError,
      refetch: result.refetch,
    }
  }, [result.data, result.isLoading, result.isError, result.refetch, wallet, enabled])
}
