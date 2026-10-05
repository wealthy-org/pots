// Browser side of the chat routes (api.md API-48 to API-51).

export type ChatMessage = {
  id: string
  wallet: string
  nickname: string | null
  body: string
  createdAt: string
}

export class ChatApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(code: string, status: number) {
    super(code)
    this.code = code
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    })
  } catch {
    throw new ChatApiError('CHAT_UNAVAILABLE', 0)
  }
  if (response.status === 204) {
    return undefined as T
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  if (!response.ok) {
    const code = (body as { error?: string } | null)?.error
    throw new ChatApiError(typeof code === 'string' ? code : 'CHAT_UNAVAILABLE', response.status)
  }
  return body as T
}

export function fetchMessages(
  after: string | null,
  signal?: AbortSignal,
): Promise<{ day: string; messages: ChatMessage[] }> {
  const query = after ? `?after=${encodeURIComponent(after)}` : ''
  return call(`/api/chat/messages${query}`, { signal })
}

export function sendMessage(body: string): Promise<{ message: ChatMessage }> {
  return call('/api/chat/messages', { method: 'POST', body: JSON.stringify({ body }) })
}

export function createSession(input: {
  wallet: string
  issuedAt: string
  signature: string
}): Promise<{ wallet: string; expiresAt: string }> {
  return call('/api/chat/session', { method: 'POST', body: JSON.stringify(input) })
}

export function readProfile(): Promise<{ wallet: string; nickname: string | null }> {
  return call('/api/profile')
}

export function saveNickname(nickname: string): Promise<{ nickname: string }> {
  return call('/api/profile', { method: 'PUT', body: JSON.stringify({ nickname }) })
}

export function removeNickname(): Promise<void> {
  return call('/api/profile', { method: 'DELETE' })
}

/** Plain messages for the codes a reader can act on; everything else reads as unavailable. */
export function describeChatError(error: unknown): string {
  const code = error instanceof ChatApiError ? error.code : 'CHAT_UNAVAILABLE'
  switch (code) {
    case 'CHAT_RATE_LIMITED':
      return 'Slow down. Try again in a few seconds.'
    case 'CHAT_UNAUTHENTICATED':
      return 'Sign in to chat.'
    case 'CHAT_INVALID':
      return 'The message is empty or longer than 280 characters.'
    case 'NICKNAME_INVALID':
      return 'Use 3 to 16 letters, digits, or underscores. Reserved and address-like names are refused.'
    case 'NICKNAME_TAKEN':
      return 'That nickname is taken.'
    case 'NICKNAME_COOLDOWN':
      return 'You changed your nickname a moment ago. Try again in 10 minutes.'
    default:
      return 'Chat is unavailable right now.'
  }
}
