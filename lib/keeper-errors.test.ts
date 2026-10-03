import { BaseError, NonceTooLowError } from 'viem'
import { describe, expect, it } from 'vitest'
import { classifyChainError } from './keeper-errors'
import { KeeperChainError } from './keeper-run'

describe('classifyChainError', () => {
  it('treats a nonce conflict as a lost race, not an outage', () => {
    expect(classifyChainError(new BaseError('nonce too low')).kind).toBe('reverted')
    expect(classifyChainError(new BaseError('replacement transaction underpriced')).kind).toBe(
      'reverted',
    )
    expect(classifyChainError(new BaseError('already known')).kind).toBe('reverted')
    expect(classifyChainError(new NonceTooLowError({ nonce: 3 })).kind).toBe('reverted')
  })

  it('maps insufficient funds to keeper_balance_low', () => {
    expect(classifyChainError(new BaseError('insufficient funds for gas')).kind).toBe(
      'keeper_balance_low',
    )
  })

  it('maps any other error to rpc_error and drops the message', () => {
    const result = classifyChainError(
      new BaseError('HTTP request failed: https://rpc.example/key-123'),
    )
    expect(result.kind).toBe('rpc_error')
    expect(result.message).toBe('rpc_error')
    expect(classifyChainError(new Error('boom')).kind).toBe('rpc_error')
  })

  it('keeps an existing KeeperChainError', () => {
    const own = new KeeperChainError('reverted')
    expect(classifyChainError(own)).toBe(own)
  })
})
