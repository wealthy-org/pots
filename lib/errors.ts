import { decodeErrorResult } from 'viem'
import { roundManagerAbi } from './contracts'

const errorMessages: Record<string, string> = {
  NotOpen: 'The round is not accepting entries.',
  RoundClosed: 'The round deadline passed before inclusion. Refresh and try again.',
  InvalidSquares: 'Pick unique squares between 1 and 25.',
  AmountBelowMinimum: 'The amount is below the minimum per square.',
  AmountAboveMaximum: 'The amount is above the maximum per square.',
  ValueMismatch: 'The total does not match squares times amount.',
  ContractPaused: 'New entries are paused.',
  NotLockable: 'The round cannot be locked yet.',
  WrongPhase: 'This action is not available in the current phase.',
  RandomnessAlreadyRequested: 'Randomness was already requested for this round.',
  NotRequested: 'Randomness has not been fulfilled yet.',
  RefundTooEarly: 'The refund window has not passed yet.',
  AlreadySettled: 'This round already settled, or the action ran twice.',
  NothingToClaim: 'There is nothing to claim for this wallet.',
  AlreadyClaimed: 'This reward was already claimed.',
  TransferFailed: 'The transfer failed. Retry after fixing the recipient.',
  InsufficientTreasury: 'The treasury balance is too low.',
  CancelNotAllowed: 'Cancellation is not allowed yet.',
  Unauthorized: 'This wallet is not authorized for that action.',
  Paused: 'New entries are paused.',
}

type ErrorCandidate = {
  shortMessage?: string
  details?: string
  message?: string
  cause?: { data?: `0x${string}`; message?: string; cause?: { data?: `0x${string}` } }
}

function decodeCustomError(data?: `0x${string}`): string | null {
  if (!data) {
    return null
  }
  try {
    const decoded = decodeErrorResult({ abi: roundManagerAbi, data })
    return decoded.errorName ?? null
  } catch {
    return null
  }
}

export function describeContractError(error: unknown): string {
  const candidate = (error ?? {}) as ErrorCandidate
  const data = candidate.cause?.data ?? candidate.cause?.cause?.data
  const customName = decodeCustomError(data)
  if (customName) {
    return errorMessages[customName] ?? `Contract error: ${customName}.`
  }

  const parts = [
    candidate.shortMessage,
    candidate.details,
    candidate.message,
    candidate.cause instanceof Error ? candidate.cause.message : candidate.cause?.message,
  ].filter((part): part is string => typeof part === 'string')
  const message = parts.join(' | ')

  for (const [key, value] of Object.entries(errorMessages)) {
    if (message.includes(key)) {
      return value
    }
  }
  if (message.toLowerCase().includes('user rejected') || message.includes('UserRejected')) {
    return 'Signature rejected in the wallet.'
  }
  if (message.toLowerCase().includes('insufficient funds')) {
    return 'Insufficient ETH for gas plus value.'
  }
  return 'The transaction failed. Refresh the round and try again.'
}
