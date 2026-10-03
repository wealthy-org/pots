'use client'

import { useReadContract } from 'wagmi'
import { InfoPage, InfoSection } from '@/components/layout/info-page'
import { activeChain } from '@/lib/chains'
import { managerAddress, roundManagerAbi, tokenAddress } from '@/lib/contracts'
import { addressUrl } from '@/lib/explorer'

function AddressRow({
  label,
  address,
  failed = false,
}: {
  label: string
  address?: string
  failed?: boolean
}) {
  const url = address ? addressUrl(address) : undefined
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-text-2">{label}</span>
      {address ? (
        <span className="font-mono text-xs break-all text-text">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center underline underline-offset-4"
            >
              {address}
            </a>
          ) : (
            address
          )}
        </span>
      ) : (
        <span className="font-mono text-xs text-text-3">{failed ? 'Unavailable' : 'Loading'}</span>
      )}
    </div>
  )
}

export default function ContractsPage() {
  const adapter = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'adapter',
  })

  return (
    <InfoPage
      title="Contracts"
      intro={`Deployed on ${activeChain.name} (chain ID ${activeChain.id}). The addresses come from this deployment's configuration and are read from the chain.`}
    >
      <InfoSection title="Addresses">
        <AddressRow label="Round manager" address={managerAddress} />
        <AddressRow label="POTS token" address={tokenAddress} />
        <AddressRow
          label="Randomness adapter"
          address={adapter.data as string | undefined}
          failed={adapter.isError}
        />
      </InfoSection>
      <InfoSection title="Notes">
        <p>
          The contracts are not upgradeable. The adapter calls the Dice commit-reveal oracle for
          randomness. Source verification and the audit status are published here when they are
          complete.
        </p>
      </InfoSection>
    </InfoPage>
  )
}