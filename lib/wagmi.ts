import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { activeChain } from './chains'

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: {
    [activeChain.id]: http(process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL, { batch: true }),
  },
  ssr: true,
})
