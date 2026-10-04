import { encodeErrorResult } from 'viem'
import { describe, expect, it } from 'vitest'
import { autoPlanAbi, roundManagerAbi } from './contracts'
import { describeContractError } from './errors'

function thrown(abi: typeof autoPlanAbi, errorName: string) {
  const data = encodeErrorResult({ abi, errorName } as Parameters<typeof encodeErrorResult>[0])
  return { cause: { data } }
}

describe('describeContractError', () => {
  it('decodes the errors of the plan contract with a plain message', () => {
    expect(describeContractError(thrown(autoPlanAbi, 'DepositTooSmall'))).toMatch(/minimum deposit/)
    expect(describeContractError(thrown(autoPlanAbi, 'PlanExists'))).toMatch(/already have a plan/)
    expect(describeContractError(thrown(autoPlanAbi, 'LoopNeedsConsent'))).toMatch(/permission/)
    expect(describeContractError(thrown(autoPlanAbi, 'PlanNotRegistered'))).toMatch(/not active/)
    expect(describeContractError(thrown(autoPlanAbi, 'InvalidRounds'))).toMatch(/1 and 100/)
  })

  it('still decodes the errors of the manager', () => {
    expect(describeContractError(thrown(roundManagerAbi, 'ContractPaused'))).toMatch(/paused/)
  })

  it('never shows raw error text for an unknown failure', () => {
    expect(describeContractError(new Error('execution reverted: 0xdeadbeef'))).not.toMatch(
      /deadbeef/,
    )
  })
})
