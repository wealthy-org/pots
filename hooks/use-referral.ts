'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useReadContracts } from 'wagmi'
import { managerAddress, roundManagerAbi, v3Enabled } from '@/lib/contracts'
import { REF_STORAGE_KEY, parseRef } from '@/lib/referral'

const ZERO = '0x0000000000000000000000000000000000000000'
const REFERRAL_REFETCH_MS = 10_000

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

/** The referrer of this visit: `?ref=` of the link, else the one kept from an earlier visit. */
function readLinkRef(): string | null {
  const fromUrl = parseRef(window.location.search)
  if (fromUrl) {
    return fromUrl
  }
  try {
    return parseRef(`?ref=${window.localStorage.getItem(REF_STORAGE_KEY) ?? ''}`)
  } catch {
    return null
  }
}

/**
 * Referral state of a wallet (v3 only). A wallet can be tagged once, only before its first deploy,
 * so `canTag` is the single condition for showing a tag control or sending `enterWithReferrer`.
 */
export function useReferral(wallet?: `0x${string}`) {
  const enabled = v3Enabled && wallet !== undefined
  const linkRef = useSyncExternalStore(
    subscribe,
    () => (v3Enabled ? readLinkRef() : null),
    () => null,
  ) as `0x${string}` | null

  useEffect(() => {
    if (!v3Enabled) {
      return
    }
    const fromUrl = parseRef(window.location.search)
    if (fromUrl) {
      try {
        window.localStorage.setItem(REF_STORAGE_KEY, fromUrl)
      } catch {
        // Storage can be blocked; the link still works for this visit.
      }
    }
  }, [])

  const result = useReadContracts({
    contracts: enabled
      ? [
          {
            address: managerAddress,
            abi: roundManagerAbi,
            functionName: 'referrerOf',
            args: [wallet],
          },
          {
            address: managerAddress,
            abi: roundManagerAbi,
            functionName: 'hasEntered',
            args: [wallet],
          },
        ]
      : [],
    query: { enabled, refetchInterval: REFERRAL_REFETCH_MS },
  })

  return useMemo(() => {
    const data = result.data
    const value = (index: number): unknown =>
      data?.[index]?.status === 'success' ? data[index].result : undefined
    const referrerRaw = value(0) as string | undefined
    const referrer =
      referrerRaw !== undefined && referrerRaw !== ZERO ? (referrerRaw as `0x${string}`) : undefined
    const hasEntered = value(1) as boolean | undefined
    const known = referrerRaw !== undefined && hasEntered !== undefined
    const canTag = enabled && known && referrer === undefined && !hasEntered
    const linkUsable =
      canTag &&
      linkRef !== null &&
      wallet !== undefined &&
      linkRef.toLowerCase() !== wallet.toLowerCase()
    return {
      enabled: v3Enabled,
      referrer,
      hasEntered,
      known,
      canTag,
      /** The referrer a first deploy should carry, or undefined. */
      pendingRef: linkUsable ? linkRef : undefined,
      linkRef,
      isLoading: result.isLoading,
      refetch: result.refetch,
    }
  }, [result.data, result.isLoading, result.refetch, enabled, linkRef, wallet])
}
