import { decodeErrorResult } from 'viem'
import { autoPlanAbi, potsTokenAbi, roundManagerAbi } from './contracts'

const errorMessages: Record<string, string> = {
  NotOpen: 'The round is not accepting deploys.',
  RoundClosed: 'The round deadline passed before inclusion. Refresh and try again.',
  InvalidSquares: 'Pick unique blocks between 1 and 25.',
  AmountBelowMinimum: 'The amount is below the minimum per block.',
  AmountAboveMaximum: 'The amount is above the maximum per block.',
  ValueMismatch: 'The total does not match blocks times amount.',
  ContractPaused: 'New deploys are paused.',
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
  Paused: 'New deploys are paused.',
  PlanExists: 'You already have a plan. Stop it first, then start a new one.',
  InvalidRounds: 'Choose between 1 and 100 rounds.',
  DepositTooSmall: 'The plan is below the minimum deposit. Add rounds, blocks, or amount.',
  PlanNotRegistered: 'Auto plans are not active on this deployment yet.',
  PlanCapReached: 'The plan limit is reached. Try again later.',
  LoopNeedsConsent: 'Loop needs your permission first. Confirm it in your wallet.',
  PlanContractNotSet: 'Auto plans are not active on this deployment yet.',
  NoPlan: 'You have no plan.',
  NotManager: 'The plan contract only accepts ETH from the round manager.',
  SelfReferral: 'You cannot refer yourself.',
  ReferrerAlreadySet: 'This wallet already has a referrer. It cannot be changed.',
  ReferralTooLate: 'A referrer can only be set before the first deploy of a wallet.',
  ZeroAddress: 'Enter a valid wallet address.',
  ERC20InsufficientBalance: 'Your POTS balance is lower than that amount.',
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
  for (const abi of [roundManagerAbi, autoPlanAbi, potsTokenAbi]) {
    try {
      return decodeErrorResult({ abi, data }).errorName ?? null
    } catch {
      // Try the next contract.
    }
  }
  return null
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
