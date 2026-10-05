import { describe, expect, it } from 'vitest'
import { describeConfigIssues, resolveChainId, validateConfig } from './config'

const address = '0x68BBC41dFd9CeDF8c7D37A171641F6F3300e5443'
const token = '0x19CC4DD8D86FC525f8CF37c51612DE91b1E52038'

const mainnet = {
  NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '4663',
  NEXT_PUBLIC_ROBINHOOD_RPC_URL: 'https://rpc.mainnet.chain.robinhood.com',
  NEXT_PUBLIC_ROUND_MANAGER_ADDRESS: address,
  NEXT_PUBLIC_POTS_TOKEN_ADDRESS: token,
  NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK: '78770000',
  NEXT_PUBLIC_INDEXER_URL: 'https://indexer.example/v1/graphql',
}

describe('validateConfig', () => {
  it('needs nothing on the local chain', () => {
    expect(validateConfig({ NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '31337' })).toEqual([])
  })

  it('accepts a complete mainnet configuration', () => {
    expect(validateConfig(mainnet)).toEqual([])
  })

  it('reports every missing variable on a non-local chain', () => {
    const issues = validateConfig({ NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '46630' })
    expect(issues.map((issue) => issue.variable)).toEqual([
      'NEXT_PUBLIC_ROUND_MANAGER_ADDRESS',
      'NEXT_PUBLIC_POTS_TOKEN_ADDRESS',
      'NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK',
    ])
  })

  it('defaults to the testnet chain id when none is set', () => {
    expect(resolveChainId({})).toBe(46630)
    expect(validateConfig({}).length).toBeGreaterThan(0)
  })

  it('rejects the zero address and malformed addresses', () => {
    const issues = validateConfig({
      ...mainnet,
      NEXT_PUBLIC_ROUND_MANAGER_ADDRESS: '0x0000000000000000000000000000000000000000',
      NEXT_PUBLIC_POTS_TOKEN_ADDRESS: '0x1234',
    })
    expect(issues.map((issue) => issue.variable)).toEqual([
      'NEXT_PUBLIC_ROUND_MANAGER_ADDRESS',
      'NEXT_PUBLIC_POTS_TOKEN_ADDRESS',
    ])
  })

  it('rejects an unknown chain id and stops there', () => {
    const issues = validateConfig({ ...mainnet, NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '1' })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.variable).toBe('NEXT_PUBLIC_ROBINHOOD_CHAIN_ID')
  })

  it('rejects a zero or malformed deploy block', () => {
    for (const value of ['0', 'abc', '-5']) {
      const issues = validateConfig({ ...mainnet, NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK: value })
      expect(issues.map((issue) => issue.variable)).toEqual([
        'NEXT_PUBLIC_ROUND_MANAGER_DEPLOY_BLOCK',
      ])
    }
  })

  it('requires an explicit RPC URL only on mainnet', () => {
    const { NEXT_PUBLIC_ROBINHOOD_RPC_URL: _unused, ...withoutRpc } = mainnet
    void _unused
    expect(validateConfig(withoutRpc).map((issue) => issue.variable)).toEqual([
      'NEXT_PUBLIC_ROBINHOOD_RPC_URL',
    ])
    expect(validateConfig({ ...withoutRpc, NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '46630' })).toEqual([])
  })

  it('rejects malformed RPC and indexer URLs but allows a missing indexer', () => {
    const bad = validateConfig({
      ...mainnet,
      NEXT_PUBLIC_ROBINHOOD_RPC_URL: 'not a url',
      NEXT_PUBLIC_INDEXER_URL: 'ftp://indexer.example',
    })
    expect(bad.map((issue) => issue.variable)).toEqual([
      'NEXT_PUBLIC_ROBINHOOD_RPC_URL',
      'NEXT_PUBLIC_INDEXER_URL',
    ])
    expect(validateConfig({ ...mainnet, NEXT_PUBLIC_INDEXER_URL: '' })).toEqual([])
  })
})

describe('describeConfigIssues', () => {
  it('joins issues into one readable line', () => {
    expect(
      describeConfigIssues([
        { variable: 'A', problem: 'is not set' },
        { variable: 'B', problem: 'is not a valid URL' },
      ]),
    ).toBe('A is not set; B is not a valid URL')
  })

  it('treats the plan address as optional and checks it when it is set', () => {
    expect(validateConfig({ ...mainnet })).toEqual([])
    expect(validateConfig({ ...mainnet, NEXT_PUBLIC_AUTO_PLAN_ADDRESS: address })).toEqual([])
    expect(
      validateConfig({
        NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '31337',
        NEXT_PUBLIC_AUTO_PLAN_ADDRESS: '0x12',
      }),
    ).toEqual([
      { variable: 'NEXT_PUBLIC_AUTO_PLAN_ADDRESS', problem: 'is not a valid, non-zero address' },
    ])
    expect(
      validateConfig({
        ...mainnet,
        NEXT_PUBLIC_AUTO_PLAN_ADDRESS: '0x0000000000000000000000000000000000000000',
      }).map((issue) => issue.variable),
    ).toEqual(['NEXT_PUBLIC_AUTO_PLAN_ADDRESS'])
  })

  it('accepts the chat switch only as true or false', () => {
    expect(
      validateConfig({ NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '31337', NEXT_PUBLIC_CHAT_ENABLED: 'true' }),
    ).toEqual([])
    expect(
      validateConfig({
        NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '31337',
        NEXT_PUBLIC_CHAT_ENABLED: 'false',
      }),
    ).toEqual([])
    expect(
      validateConfig({ NEXT_PUBLIC_ROBINHOOD_CHAIN_ID: '31337', NEXT_PUBLIC_CHAT_ENABLED: 'yes' }),
    ).toEqual([{ variable: 'NEXT_PUBLIC_CHAT_ENABLED', problem: 'must be true or false' }])
  })
})
