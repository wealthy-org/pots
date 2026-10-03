import { BaseError, ContractFunctionRevertedError, NonceTooHighError, NonceTooLowError } from 'viem'
import { KeeperChainError } from './keeper-run'

const LOST_RACE =
  /nonce too (low|high)|nonce has already been used|lower than the current nonce|replacement transaction underpriced|already known/i

/**
 * Reduces a viem error to a kind. A nonce conflict means another call of the same keeper account
 * won the race, so it counts as a revert (benign), not as an RPC outage.
 */
export function classifyChainError(error: unknown): KeeperChainError {
  if (error instanceof KeeperChainError) return error
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof ContractFunctionRevertedError)) {
      return new KeeperChainError('reverted')
    }
    if (/insufficient funds/i.test(error.message)) {
      return new KeeperChainError('keeper_balance_low')
    }
    const nonceConflict = error.walk(
      (cause) => cause instanceof NonceTooLowError || cause instanceof NonceTooHighError,
    )
    if (nonceConflict || LOST_RACE.test(error.message)) {
      return new KeeperChainError('reverted')
    }
  }
  return new KeeperChainError('rpc_error')
}
