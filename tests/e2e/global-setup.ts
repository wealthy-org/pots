import { execFileSync, spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ANVIL_PORT, ANVIL_URL, OWNER_KEY, manager, rpc } from '../support/chain'

const exe = process.platform === 'win32' ? '.exe' : ''
const foundryBin = process.env.FOUNDRY_BIN ?? join(homedir(), '.foundry', 'bin')

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function rpcAnswers(): Promise<boolean> {
  try {
    await rpc('eth_chainId')
    return true
  } catch {
    return false
  }
}

export default async function globalSetup() {
  if (await rpcAnswers()) {
    throw new Error(
      `Port ${ANVIL_PORT} already answers JSON-RPC. Stop that process; the suite starts its own Anvil.`,
    )
  }

  const anvil = spawn(join(foundryBin, `anvil${exe}`), ['--port', String(ANVIL_PORT), '--silent'], {
    stdio: 'ignore',
  })
  for (let attempt = 0; attempt < 60 && !(await rpcAnswers()); attempt += 1) {
    await sleep(500)
  }
  if (!(await rpcAnswers())) {
    throw new Error('Anvil did not start. Set FOUNDRY_BIN to the Foundry bin directory.')
  }

  execFileSync(
    join(foundryBin, `forge${exe}`),
    [
      'script',
      'script/DeployLocal.s.sol',
      '--rpc-url',
      ANVIL_URL,
      '--private-key',
      OWNER_KEY,
      '--broadcast',
    ],
    { cwd: join(process.cwd(), 'contracts'), stdio: 'pipe', timeout: 300_000 },
  )
  await manager.write('startNextRound')

  return async () => {
    if (anvil.pid === undefined) {
      return
    }
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/PID', String(anvil.pid), '/T', '/F'], { stdio: 'ignore' })
      } catch {
        // Anvil already exited.
      }
    } else {
      anvil.kill('SIGTERM')
    }
  }
}
