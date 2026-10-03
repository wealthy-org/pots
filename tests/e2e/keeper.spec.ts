import { test, expect } from './fixtures'
import {
  KEEPER_SECRET,
  dice,
  findOutput,
  increaseTime,
  manager,
  playerEnter,
} from '../support/chain'

const PHASE_PENDING = 4
const PHASE_WAITING = 1

type RoundView = { phase: number; randomnessRequestId: bigint }

async function currentRound(): Promise<{ id: bigint; round: RoundView }> {
  const id = (await manager.read('currentRoundId')) as bigint
  const round = (await manager.read('getRound', [id])) as RoundView
  return { id, round }
}

/** Plays the Dice oracle: delivers the output once the keeper has requested randomness. */
async function fulfillWhenRequested(roundId: bigint, square: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const round = (await manager.read('getRound', [roundId])) as RoundView
    if (round.phase === PHASE_PENDING && round.randomnessRequestId > 0n) {
      await dice.fulfill(round.randomnessRequestId, findOutput(square))
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('the keeper never requested randomness')
}

const headers = { authorization: `Bearer ${KEEPER_SECRET}` }

test.describe('keeper route', () => {
  test('rejects a call without the secret and changes nothing', async ({ request }) => {
    const before = await currentRound()
    const response = await request.post('/api/keeper')
    expect(response.status()).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
    expect((await currentRound()).round.phase).toBe(before.round.phase)
  })

  test('does nothing while the round is open before its deadline', async ({ request }) => {
    await playerEnter([1, 2, 3], 10n ** 15n)
    const response = await request.post('/api/keeper', { headers })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.status).toBe('noop')
    expect(body.actions).toEqual([])
    expect(body.round.phase).toBe('OPEN')
  })

  test('drives a full round with no manual action, then reports the next round as waiting', async ({
    request,
  }) => {
    await playerEnter([4, 5], 10n ** 15n)
    await increaseTime(61)
    const { id } = await currentRound()

    const oracle = fulfillWhenRequested(id, 4)
    const response = await request.post('/api/keeper', { headers })
    await oracle

    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.actions.map((action: { name: string }) => action.name)).toEqual([
      'lock',
      'requestRandomness',
      'settle',
      'startNextRound',
    ])
    expect(body.actions.every((action: { ok: boolean }) => action.ok)).toBe(true)
    expect(body.round).toEqual({ id: (id + 1n).toString(), phase: 'WAITING' })
    expect(body.alerts).toEqual([])
    expect(JSON.stringify(body)).not.toContain(KEEPER_SECRET)

    const settled = (await manager.read('getRound', [id])) as {
      phase: number
      winningSquare: number
    }
    expect(settled.phase).toBe(5)
    expect(settled.winningSquare).toBe(4)
    expect((await currentRound()).round.phase).toBe(PHASE_WAITING)
  })

  test('a second call right after is a no-op and a concurrent pair causes no state error', async ({
    request,
  }) => {
    await playerEnter([6], 10n ** 15n)
    await increaseTime(61)
    const { id } = await currentRound()

    const oracle = fulfillWhenRequested(id, 6)
    const [first, second] = await Promise.all([
      request.post('/api/keeper', { headers }),
      request.post('/api/keeper', { headers }),
    ])
    await oracle

    expect([first.status(), second.status()]).toEqual([200, 200])
    const settled = (await manager.read('getRound', [id])) as { phase: number }
    expect(settled.phase).toBe(5)
    const after = await request.post('/api/keeper', { headers })
    expect((await after.json()).status).toBe('noop')
  })

  test('the status route reports ok and sends nothing', async ({ request }) => {
    const before = await currentRound()
    const response = await request.get('/api/keeper/status', { headers })
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.alerts).toEqual([])
    expect(body.actions).toEqual([])
    expect((await currentRound()).round.phase).toBe(before.round.phase)
  })
})
