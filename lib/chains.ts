import { defineChain } from 'viem'

const chainId = Number(process.env.NEXT_PUBLIC_ROBINHOOD_CHAIN_ID ?? 46630)
const defaultRpcUrls: Record<number, string> = {
  46630: 'https://robinhood-sepolia-rpc.publicnode.com',
  4663: 'https://rpc.mainnet.chain.robinhood.com',
  31337: 'http://127.0.0.1:8545',
}
const rpcUrl =
  process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL ?? defaultRpcUrls[chainId] ?? defaultRpcUrls[46630]

function chainName(id: number): string {
  if (id === 31337) return 'Anvil Local'
  if (id === 4663) return 'Robinhood Chain'
  return 'Robinhood Chain Testnet'
}

export const activeChain = defineChain({
  id: chainId,
  name: chainName(chainId),
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  testnet: chainId !== 4663,
})
