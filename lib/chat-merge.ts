import type { ChatMessage } from './chat-client'

export type ChatView = { messages: ChatMessage[]; cursor: string | null }

/**
 * Merges messages into the list the reader sees. The polling cursor moves only with messages that
 * came from a poll (`fromPoll`): a message the reader just sent is shown at once but must not move
 * the cursor, or the messages that others posted just before it would never be fetched.
 */
export function mergeMessages(
  view: ChatView,
  incoming: ChatMessage[],
  options: { restart: boolean; fromPoll: boolean },
): ChatView {
  const base = options.restart ? [] : view.messages
  const known = new Set(base.map((message) => message.id))
  const added = incoming.filter((message) => !known.has(message.id))
  const messages = added.length ? [...base, ...added] : base
  let cursor = options.restart ? null : view.cursor
  if (options.fromPoll && incoming.length > 0) {
    cursor = incoming[incoming.length - 1].id
  }
  return { messages, cursor }
}
