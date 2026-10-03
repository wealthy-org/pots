'use client'

import { useAccount, useBalance, useReadContract } from 'wagmi'
import { EthMark, PotsMark } from '@/components/ui/token-mark'
import { potsTokenAbi, tokenAddress } from '@/lib/contracts'
import { formatWeiToEth } from '@/lib/wei'

const chipClass =
  'hidden h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 font-mono text-xs text-text lg:flex'

/** ETH and POTS balances of the connected wallet, as amounts only (no USD, D-23). */
export function Balances() {
  const { address, isConnected } = useAccount()
  const eth = useBalance({ address, query: { enabled: isConnected, refetchInterval: 10000 } })
  const pots = useReadContract({
    address: tokenAddress,
    abi: potsTokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isConnected && Boolean(address), refetchInterval: 10000 },
  })

  if (!isConnected) {
    return null
  }
  const potsValue = pots.data as bigint | undefined

  return (
    <>
      <span title="POTS balance" className={chipClass}>
        <PotsMark className="h-4 w-4" />
        <span className="sr-only">POTS balance: </span>
        {potsValue !== undefined ? formatWeiToEth(potsValue, 2) : '-'}
      </span>
      <span title="ETH balance" className={chipClass}>
        <EthMark className="h-4 w-4" />
        <span className="sr-only">ETH balance: </span>
        {eth.data ? formatWeiToEth(eth.data.value, 4) : '-'}
      </span>
    </>
  )
}
