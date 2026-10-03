import { describe, expect, it } from 'vitest'
import { canEnterPhase } from './entry-phase'
import { Phase } from './types'

describe('canEnterPhase', () => {
  it('allows an unknown round, a waiting round, and an open round before its deadline', () => {
    expect(canEnterPhase(undefined, false, false)).toBe(true)
    expect(canEnterPhase(Phase.WAITING, false, false)).toBe(true)
    expect(canEnterPhase(Phase.OPEN, false, false)).toBe(true)
  })

  it('allows a finished round because the deploy starts the next one', () => {
    expect(canEnterPhase(Phase.SETTLED, true, false)).toBe(true)
    expect(canEnterPhase(Phase.CANCELLED, true, false)).toBe(true)
  })

  it('rejects an open round whose countdown ended, before the keeper locks it', () => {
    expect(canEnterPhase(Phase.OPEN, false, true)).toBe(false)
  })

  it('rejects locked and pending rounds', () => {
    expect(canEnterPhase(Phase.LOCKED, false, false)).toBe(false)
    expect(canEnterPhase(Phase.RANDOMNESS_PENDING, false, false)).toBe(false)
  })
})
