'use client'

import { useEffect, useRef, useState } from 'react'
import { useReadContract } from 'wagmi'
import type { GridCellData } from '@/components/mine/grid-cell'
import { managerAddress, roundManagerAbi } from '@/lib/contracts'
import { AWAIT_MAX_MS, HOLD_MS, landingHops, revealTarget, type SeenRound } from '@/lib/reveal'
import { Phase, type RoundData } from '@/lib/types'

type Stage = 'await' | 'landing' | 'hold'

type Seen = SeenRound & { round: RoundData; cells: GridCellData[] }

type Reveal = { roundId: bigint; round: RoundData; cells: GridCellData[] }

export type RevealView = {
  active: boolean
  stage: Stage | null
  /** The round on screen during the reveal (the one that just ended). */
  roundId?: bigint
  /** Shown as pending until the landing is over, so the timer does not give the result away. */
  round?: RoundData
  /** The grid of that round as the page last saw it. */
  cells?: GridCellData[]
  /** 0-based block lit by the landing scan, or null. */
  landingIndex: number | null
  /** 0-based winning block during the hold, or null. */
  winIndex: number | null
  /** True until the winning block is shown: the result must not leak into other panels. */
  hideResult: boolean
}

const IDLE: RevealView = {
  active: false,
  stage: null,
  landingIndex: null,
  winIndex: null,
  hideResult: false,
}

/**
 * The keeper chains settle and the start of the next round, so the page sees the round id jump
 * and never shows the winner. This keeps the round that just ended on screen: the scan lands on
 * the on-chain winning block, holds there (HOLD_MS), and only then lets the new round take over.
 * The animation is presentation: the winning block always comes from the settled round.
 */
export function useRevealSequence({
  roundId,
  round,
  cells,
}: {
  roundId?: bigint
  round?: RoundData
  cells: GridCellData[]
}): RevealView {
  const [seen, setSeen] = useState<Seen | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [stage, setStage] = useState<Stage>('await')
  const [landingIndex, setLandingIndex] = useState<number | null>(null)
  const [winIndex, setWinIndex] = useState<number | null>(null)
  // A tab that was in the background does not poll, so when it returns the round it last saw has
  // long ended: showing that old result as a live reveal would be wrong.
  const wasHidden = useRef(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        wasHidden.current = true
        clearTimeout(timer)
      } else {
        // The refetch on focus lands within a moment; after that a reveal is live again.
        timer = setTimeout(() => {
          wasHidden.current = false
        }, 6000)
      }
    }
    document.addEventListener('visibilitychange', onChange)
    return () => {
      document.removeEventListener('visibilitychange', onChange)
      clearTimeout(timer)
    }
  }, [])

  // Derived state from props, updated while rendering (the React-documented pattern, no effect).
  if (
    roundId !== undefined &&
    round &&
    (seen?.roundId !== roundId || seen.round !== round || seen.cells !== cells)
  ) {
    const target = revealTarget(seen, { roundId, phase: round.phase })
    if (target !== null && seen && !reveal) {
      setReveal({ roundId: seen.roundId, round: seen.round, cells: seen.cells })
      setStage('await')
      setLandingIndex(null)
      setWinIndex(null)
    }
    setSeen({
      roundId,
      phase: round.phase,
      hasEntries: round.totalEth > 0n,
      round,
      cells,
    })
  }

  const result = useReadContract({
    address: managerAddress,
    abi: roundManagerAbi,
    functionName: 'getRound',
    args: reveal ? [reveal.roundId] : undefined,
    query: {
      enabled: reveal !== null,
      refetchInterval: reveal && stage === 'await' ? 1000 : false,
    },
  })
  const resultRound = result.data as unknown as RoundData | undefined
  const resultPhase = resultRound?.phase
  const winningSquare = resultRound?.winningSquare
  const revealId = reveal?.roundId

  /* eslint-disable react-hooks/set-state-in-effect -- the sequence is driven by timers: each step ends one stage and starts the next */
  useEffect(() => {
    if (revealId === undefined) {
      return
    }
    const timers: ReturnType<typeof setTimeout>[] = []
    const finish = () => {
      setReveal(null)
      setLandingIndex(null)
      setWinIndex(null)
    }
    if (document.visibilityState !== 'visible' || wasHidden.current) {
      finish()
      return
    }
    if (resultPhase !== Phase.SETTLED) {
      if (resultPhase === Phase.CANCELLED) {
        finish()
        return
      }
      timers.push(setTimeout(finish, AWAIT_MAX_MS))
      return () => timers.forEach(clearTimeout)
    }
    const win = (winningSquare ?? 1) - 1
    const hold = () => {
      setStage('hold')
      setLandingIndex(null)
      setWinIndex(win)
      timers.push(setTimeout(finish, HOLD_MS))
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      hold()
    } else {
      setStage('landing')
      let at = 0
      for (const hop of landingHops(win)) {
        timers.push(setTimeout(() => setLandingIndex(hop.index), at))
        at += hop.delayMs
      }
      timers.push(setTimeout(hold, at))
    }
    return () => timers.forEach(clearTimeout)
  }, [revealId, resultPhase, winningSquare])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!reveal) {
    return IDLE
  }
  const shown: RoundData =
    stage === 'hold' && resultRound
      ? resultRound
      : { ...reveal.round, phase: Phase.RANDOMNESS_PENDING }
  return {
    active: true,
    stage,
    roundId: reveal.roundId,
    round: shown,
    cells: reveal.cells,
    landingIndex,
    winIndex,
    hideResult: stage !== 'hold',
  }
}
