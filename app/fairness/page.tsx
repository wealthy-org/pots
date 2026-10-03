'use client'

import { useState } from 'react'
import { encodePacked, keccak256 } from 'viem'
import { useReadContract } from 'wagmi'
import { InfoPage, InfoSection } from '@/components/layout/info-page'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'
import { Phase, ZERO_BYTES32, type RoundData } from '@/lib/types'

const SNIPPET = `import { encodePacked, keccak256 } from 'viem'

const block = (BigInt(keccak256(encodePacked(['bytes32', 'string'], [output, 'SQUARE']))) % 25n) + 1n
const jackpotRoll = BigInt(keccak256(encodePacked(['bytes32', 'string'], [output, 'JACKPOT'])))
const jackpot = jackpotRoll % jackpotChanceDenominator === 0n`

function RoundCheck() {
  const [input, setInput] = useState('1')
  const roundId = /^\d+$/.test(input) && input !== '0' ? BigInt(input) : undefined

  const round = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'getRound',
    args: roundId !== undefined ? [roundId] : undefined,
    query: { enabled: roundId !== undefined },
  })
  const denominator = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'jackpotChanceDenominator',
  })

  const data = round.data as RoundData | undefined
  const hasOutput = data !== undefined && data.randomOutput !== ZERO_BYTES32
  const computedBlock = hasOutput
    ? (BigInt(keccak256(encodePacked(['bytes32', 'string'], [data.randomOutput, 'SQUARE']))) %
        25n) +
      1n
    : undefined
  const denominatorValue = denominator.data as bigint | undefined
  const computedJackpot =
    hasOutput && denominatorValue
      ? BigInt(keccak256(encodePacked(['bytes32', 'string'], [data.randomOutput, 'JACKPOT']))) %
          denominatorValue ===
        0n
      : undefined
  const settled = data?.phase === Phase.SETTLED
  // The contract rolls the jackpot only when someone deployed on the winning block.
  const jackpotNotEvaluated = settled && data !== undefined && data.winningSquareEth === 0n

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-bg-elev p-4">
      <label className="flex flex-col gap-1.5 text-xs text-text-2">
        Round number
        <input
          inputMode="numeric"
          value={input}
          onChange={(event) => setInput(event.target.value.replace(/[^0-9]/g, ''))}
          className="h-11 rounded-md border border-line-2 bg-black/35 px-3 font-mono text-sm text-text"
        />
      </label>
      {roundId === undefined ? (
        <p className="text-xs text-text-2">Enter a round number of 1 or more.</p>
      ) : round.isLoading ? (
        <p className="text-xs text-text-2">Reading the round from the chain.</p>
      ) : round.isError ? (
        <p className="text-xs text-loss">
          The chain read failed. Check the round number and retry.
        </p>
      ) : !hasOutput ? (
        <p className="text-xs text-text-2">This round has no stored random output yet.</p>
      ) : (
        <dl className="grid gap-2 text-xs">
          <div>
            <dt className="text-text-3">Stored random output</dt>
            <dd className="font-mono break-all text-text">{data.randomOutput}</dd>
          </div>
          <div>
            <dt className="text-text-3">Winning block computed from the output</dt>
            <dd className="font-mono text-gold">#{computedBlock?.toString()}</dd>
          </div>
          {settled ? (
            <div>
              <dt className="text-text-3">Winning block stored by the contract</dt>
              <dd className="font-mono text-text">
                #{data.winningSquare}{' '}
                {computedBlock === BigInt(data.winningSquare) ? '(matches)' : '(does not match)'}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-text-3">Jackpot roll computed from the output</dt>
            <dd className="font-mono text-text">
              {computedJackpot === undefined ? '-' : computedJackpot ? 'hit' : 'no hit'}
              {settled && computedJackpot !== undefined
                ? jackpotNotEvaluated
                  ? ' (not evaluated: no miners on the winning block, so no jackpot is paid)'
                  : computedJackpot === data.jackpotHit
                    ? ' (matches)'
                    : ' (does not match)'
                : ''}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

export default function FairnessPage() {
  return (
    <InfoPage
      title="Fairness"
      intro="How the winning block is chosen, and how to check a round yourself."
    >
      <InfoSection title="Where the randomness comes from">
        <p>
          When a round locks, the contract asks the Dice oracle for one random output. Dice is a
          commit-reveal oracle: it committed to its secrets before the request, and it reveals the
          output afterwards. The output is not produced by this project.
        </p>
        <p>
          The contract stores exactly one output per round. The winning block and the jackpot roll
          are computed on chain from that output, so anyone can repeat the computation.
        </p>
        <p>
          Trust assumption: as long as Dice&apos;s commitments hold, the provider can delay a
          reveal, which stalls the round, but it cannot choose the result. Dice is a third-party
          protocol that this project has not audited. If a reveal never arrives, the round can be
          cancelled and every deploy is refunded.
        </p>
      </InfoSection>

      <InfoSection title="The computation">
        <pre
          tabIndex={0}
          role="region"
          aria-label="Winning block and jackpot computation, as code"
          className="overflow-x-auto rounded-md border border-line bg-bg-elev p-3 font-mono text-[11px] text-text"
        >
          {SNIPPET}
        </pre>
        <p>
          Winning block: the output with the label SQUARE, hashed, modulo 25, plus 1. Jackpot: the
          output with the label JACKPOT, hashed, modulo the jackpot denominator; a result of 0 is a
          hit.
        </p>
      </InfoSection>

      <InfoSection title="Check a round">
        <RoundCheck />
      </InfoSection>
    </InfoPage>
  )
}
