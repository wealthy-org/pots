import { getAddress, isAddress } from 'viem'

export const REF_STORAGE_KEY = 'pots.ref'

/** A referrer address from `?ref=`, checksummed, or null when it is missing or malformed. */
export function parseRef(search: string): `0x${string}` | null {
  const value = new URLSearchParams(search).get('ref')
  if (!value || !isAddress(value, { strict: false }) || /^0x0{40}$/i.test(value)) {
    return null
  }
  return getAddress(value)
}

/** The link a wallet shares: the Mine page with its own address as the referrer. */
export function referralLink(origin: string, wallet: string): string {
  return `${origin}/mine?ref=${wallet}`
}

/** What a referrer earns on a claim of `claim` POTS (wei): 1% (100 basis points). */
export function referralBonus(claim: bigint, bps: bigint = 100n): bigint {
  return (claim * bps) / 10_000n
}
