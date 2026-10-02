'use client'

import { useReadContract } from 'wagmi'
import { Panel } from '@/components/ui/panel'
import { managerAddress, potsTokenAbi, roundManagerAbi, tokenAddress } from '@/lib/contracts'
import { formatWeiToEth } from '@/lib/wei'

function readPots(read: { data: unknown; isError: boolean }, decimals: number): string {
  if (read.data !== undefined) {
    return `${formatWeiToEth(read.data as bigint, decimals)} POTS`
  }
  return read.isError ? 'Unavailable' : 'Loading'
}

export default function TokenPage() {
  const name = useReadContract({ address: tokenAddress, abi: potsTokenAbi, functionName: 'name' })
  const symbol = useReadContract({
    address: tokenAddress,
    abi: potsTokenAbi,
    functionName: 'symbol',
  })
  const cap = useReadContract({ address: tokenAddress, abi: potsTokenAbi, functionName: 'cap' })
  const totalSupply = useReadContract({
    address: tokenAddress,
    abi: potsTokenAbi,
    functionName: 'totalSupply',
  })
  const emission = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'potEmissionPerRound',
  })

  const emissionValue = readPots(emission, 4)
  const totalSupplyValue = readPots(totalSupply, 4)
  const capValue = readPots(cap, 2)

  return (
    <section aria-labelledby="token-title" className="flex flex-col gap-4">
      <div>
        <h1 id="token-title" className="text-2xl font-bold">
          Token
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-2">
          Emission facts read directly from the deployed contracts. No price or profit is implied.
        </p>
      </div>

      <Panel>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="Name" value={(name.data as string | undefined) ?? '...'} />
          <Fact label="Symbol" value={(symbol.data as string | undefined) ?? '...'} />
          <Fact label="Emission per eligible round" value={emissionValue} />
          <Fact label="Total supply" value={totalSupplyValue} />
          <Fact label="Cap" value={capValue} />
          <Fact label="Chain ID" value={process.env.NEXT_PUBLIC_ROBINHOOD_CHAIN_ID ?? '46630'} />
        </dl>
      </Panel>

      <Panel>
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase">
          Contract
        </h2>
        <p className="mt-2 font-mono text-xs break-all text-text">{tokenAddress}</p>
        <p className="mt-2 text-xs text-text-2">
          Symbol and cap are provisional until the owner confirms the token decisions (D-02). The
          reserve or capped mint model is not final.
        </p>
      </Panel>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold tracking-[0.14em] text-text-3 uppercase">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm">{value}</dd>
    </div>
  )
}
