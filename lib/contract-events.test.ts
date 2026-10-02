import { describe, expect, it } from 'vitest'
import { toEventSelector, type AbiEvent } from 'viem'
import potsRoundManagerAbi from '../contracts/abi/PotsRoundManager.json'
import {
  entryPlacedEvent,
  jackpotPaidEvent,
  refundClaimedEvent,
  rewardClaimedEvent,
  roundSettledEvent,
} from './contract-events'

const abiEvents = (potsRoundManagerAbi as Array<{ type: string; name?: string }>).filter(
  (item) => item.type === 'event',
)

describe('contract event fragments', () => {
  const fragments = [
    entryPlacedEvent,
    rewardClaimedEvent,
    refundClaimedEvent,
    roundSettledEvent,
    jackpotPaidEvent,
  ]

  it.each(fragments.map((fragment) => [fragment.name, fragment] as const))(
    '%s matches the generated ABI',
    (name, fragment) => {
      const abiItem = abiEvents.find((item) => item.name === name)
      expect(abiItem).toBeDefined()
      expect(toEventSelector(fragment)).toBe(toEventSelector(abiItem as unknown as AbiEvent))
    },
  )
})
