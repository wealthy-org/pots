import { describe, expect, it } from 'vitest'
import { mergeMessages } from './chat-merge'
import type { ChatMessage } from './chat-client'

const message = (id: number, body = `m${id}`): ChatMessage => ({
  id: String(id),
  wallet: '0x' + '1'.repeat(40),
  nickname: null,
  body,
  createdAt: '2026-10-05T00:00:00.000Z',
})

describe('mergeMessages', () => {
  it('moves the cursor with polled messages', () => {
    const view = mergeMessages({ messages: [], cursor: null }, [message(1), message(2)], {
      restart: false,
      fromPoll: true,
    })
    expect(view.cursor).toBe('2')
    expect(view.messages.map((m) => m.id)).toEqual(['1', '2'])
  })

  it('does not move the cursor for a message the reader sent, so earlier messages are still fetched', () => {
    const start = mergeMessages({ messages: [], cursor: null }, [message(10)], {
      restart: false,
      fromPoll: true,
    })
    // Others posted 11 and 12, then the reader's own message 13 comes back from the send call.
    const afterSend = mergeMessages(start, [message(13)], { restart: false, fromPoll: false })
    expect(afterSend.cursor).toBe('10')
    // The next poll asks for ids after 10 and receives 11, 12, and 13 (13 is not duplicated).
    const afterPoll = mergeMessages(afterSend, [message(11), message(12), message(13)], {
      restart: false,
      fromPoll: true,
    })
    expect(afterPoll.cursor).toBe('13')
    expect(afterPoll.messages.map((m) => m.id)).toEqual(['10', '13', '11', '12'])
  })

  it('skips duplicates and keeps the cursor when a poll returns nothing', () => {
    const view = mergeMessages({ messages: [], cursor: null }, [message(1)], {
      restart: false,
      fromPoll: true,
    })
    const same = mergeMessages(view, [message(1)], { restart: false, fromPoll: true })
    expect(same.messages).toHaveLength(1)
    const empty = mergeMessages(same, [], { restart: false, fromPoll: true })
    expect(empty).toEqual(same)
  })

  it('restarts the list and the cursor on a new day', () => {
    const view = mergeMessages({ messages: [], cursor: null }, [message(1), message(2)], {
      restart: false,
      fromPoll: true,
    })
    const next = mergeMessages(view, [], { restart: true, fromPoll: true })
    expect(next).toEqual({ messages: [], cursor: null })
    const newDay = mergeMessages(view, [message(50)], { restart: true, fromPoll: true })
    expect(newDay).toEqual({ messages: [message(50)], cursor: '50' })
  })
})
