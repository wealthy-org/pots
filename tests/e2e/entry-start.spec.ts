import { test, expect } from './fixtures'
import { connect, reviewEntry, selectSquares, setAmount } from '../support/ui'
import { setWalletMode } from '../support/wallet'
import { dice, findOutput, increaseTime, manager, playerEnter } from '../support/chain'

type RoundView = { phase: number; randomnessRequestId: bigint }

test.describe('entry starts the next round', () => {
  test('a finished round is followed by a start and an entry from one MINE action, with the keeper offline', async ({
    page,
    installWallet,
  }) => {
    await playerEnter([3], 10n ** 15n)
    await increaseTime(61)
    await manager.write('lock')
    await manager.write('requestRandomness')
    const pending = (await manager.read('getRound', [1n])) as RoundView
    await dice.fulfill(pending.randomnessRequestId, findOutput(9))
    await manager.write('settle', [1n])
    expect(((await manager.read('getRound', [1n])) as RoundView).phase).toBe(5)

    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await expect(page.getByRole('button', { name: /^Start (round 1|next round)/ })).toHaveCount(0)

    await selectSquares(page, [7])
    await setAmount(page, '0.001')
    const dialog = await reviewEntry(page)
    await expect(dialog.getByText('#2', { exact: true })).toBeVisible()
    await expect(dialog.getByText(/two confirmations/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()
    await expect(page.getByText('Deployed', { exact: true })).toBeVisible()

    expect(await manager.read('currentRoundId')).toBe(2n)
    expect(((await manager.read('getRound', [2n])) as RoundView).phase).toBe(2)
    await expect(page.getByText('Your deploy this round: 0.001 ETH')).toBeVisible()
  })

  test('does not send a second start when the keeper already started the round', async ({
    page,
    installWallet,
  }) => {
    await playerEnter([3], 10n ** 15n)
    await increaseTime(61)
    await manager.write('lock')
    await manager.write('requestRandomness')
    const pending = (await manager.read('getRound', [1n])) as RoundView
    await dice.fulfill(pending.randomnessRequestId, findOutput(9))
    await manager.write('settle', [1n])
    await manager.write('startNextRound')

    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await selectSquares(page, [7])
    await setAmount(page, '0.001')
    const dialog = await reviewEntry(page)
    await expect(dialog.getByText(/two confirmations/)).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()
    await expect(page.getByText('Deployed', { exact: true })).toBeVisible()
    expect(await manager.read('currentRoundId')).toBe(2n)
  })

  test('keeps the selection and explains a rejected start step', async ({
    page,
    installWallet,
  }) => {
    await playerEnter([3], 10n ** 15n)
    await increaseTime(61)
    await manager.write('lock')
    await manager.write('requestRandomness')
    const pending = (await manager.read('getRound', [1n])) as RoundView
    await dice.fulfill(pending.randomnessRequestId, findOutput(9))
    await manager.write('settle', [1n])

    await installWallet()
    await page.goto('/mine')
    await connect(page)
    await selectSquares(page, [7, 8])
    await setAmount(page, '0.001')
    const dialog = await reviewEntry(page)
    await setWalletMode(page, 'reject')
    await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()

    await expect(dialog.getByText('Signature rejected in the wallet.')).toBeVisible()
    expect(await manager.read('currentRoundId')).toBe(1n)
    await expect(dialog.getByText('7, 8')).toBeVisible()

    await setWalletMode(page, 'approve')
    await dialog.getByRole('button', { name: 'Confirm in wallet' }).click()
    await expect(page.getByText('Deployed', { exact: true })).toBeVisible()
    expect(await manager.read('currentRoundId')).toBe(2n)
  })
})
