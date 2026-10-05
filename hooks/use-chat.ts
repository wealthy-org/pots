'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import {
  ChatApiError,
  createSession,
  describeChatError,
  fetchMessages,
  readProfile,
  removeNickname,
  saveNickname,
  sendMessage,
  type ChatMessage,
} from '@/lib/chat-client'
import { mergeMessages } from '@/lib/chat-merge'
import { signInMessage } from '@/lib/chat-sign'
import { activeChain } from '@/lib/chains'

const POLL_MS = 5000

export type ChatState = {
  messages: ChatMessage[]
  loading: boolean
  unavailable: boolean
  signedIn: boolean
  nickname: string | null
  error: string | null
  busy: boolean
  send: (body: string) => Promise<boolean>
  signIn: () => Promise<void>
  setNickname: (value: string) => Promise<boolean>
  clearNickname: () => Promise<void>
}

/**
 * Chat of the current UTC day. Polls every 5 seconds only while `open` and the tab is visible; the
 * list restarts when the server day changes (the 00:00 UTC purge). Nothing here touches the game.
 */
export function useChat(open: boolean): ChatState {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [signedWallet, setSignedWallet] = useState<string | null>(null)
  const [nickname, setNicknameState] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const day = useRef<string | null>(null)

  // Messages and the polling cursor live in one ref-backed view so the cursor moves only with polls.
  const view = useRef<{ messages: ChatMessage[]; cursor: string | null }>({
    messages: [],
    cursor: null,
  })

  const merge = useCallback(
    (
      incoming: ChatMessage[],
      serverDay: string,
      options: { replace: boolean; fromPoll: boolean },
    ) => {
      const restart = options.replace || (day.current !== null && day.current !== serverDay)
      day.current = serverDay
      view.current = mergeMessages(view.current, incoming, { restart, fromPoll: options.fromPoll })
      setMessages(view.current.messages)
    },
    [],
  )
  /* eslint-disable react-hooks/set-state-in-effect -- the polling effect owns the loading and availability flags */
  useEffect(() => {
    if (!open) {
      return
    }
    let stopped = false
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll(first: boolean) {
      if (stopped) {
        return
      }
      if (document.visibilityState === 'visible') {
        try {
          const result = await fetchMessages(first ? null : view.current.cursor, controller.signal)
          if (stopped) {
            return
          }
          merge(result.messages, result.day, { replace: first, fromPoll: true })
          setUnavailable(false)
          setLoading(false)
        } catch (failure) {
          if (stopped || (failure instanceof DOMException && failure.name === 'AbortError')) {
            return
          }
          setUnavailable(true)
          setLoading(false)
        }
      }
      if (!stopped) {
        timer = setTimeout(() => void poll(false), POLL_MS)
      }
    }
    setLoading(true)
    void poll(true)
    return () => {
      stopped = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [open, merge])

  // Is there a chat cookie for the connected wallet? Asked when the panel opens or the wallet changes.
  useEffect(() => {
    if (!open || !isConnected || !address) {
      setSignedWallet(null)
      setNicknameState(null)
      return
    }
    let stopped = false
    readProfile()
      .then((profile) => {
        if (!stopped) {
          setSignedWallet(profile.wallet)
          setNicknameState(profile.nickname)
        }
      })
      .catch(() => {
        if (!stopped) {
          setSignedWallet(null)
          setNicknameState(null)
        }
      })
    return () => {
      stopped = true
    }
  }, [open, isConnected, address])
  /* eslint-enable react-hooks/set-state-in-effect */

  const signedIn = Boolean(address && signedWallet && signedWallet === address.toLowerCase())

  const signIn = useCallback(async () => {
    if (!address) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const issuedAt = new Date().toISOString()
      const signature = await signMessageAsync({
        message: signInMessage({ wallet: address, chainId: activeChain.id, issuedAt }),
      })
      const session = await createSession({ wallet: address, issuedAt, signature })
      setSignedWallet(session.wallet)
      setNicknameState((await readProfile().catch(() => null))?.nickname ?? null)
    } catch (failure) {
      const rejected =
        !(failure instanceof ChatApiError) &&
        /reject|denied|declined/i.test(failure instanceof Error ? failure.message : '')
      setError(rejected ? 'Signature rejected. Sign in to chat.' : describeChatError(failure))
    } finally {
      setBusy(false)
    }
  }, [address, signMessageAsync])

  const send = useCallback(
    async (body: string) => {
      setBusy(true)
      setError(null)
      try {
        const { message } = await sendMessage(body)
        merge([message], day.current ?? message.createdAt.slice(0, 10), {
          replace: false,
          fromPoll: false,
        })
        return true
      } catch (failure) {
        if (failure instanceof ChatApiError && failure.code === 'CHAT_UNAUTHENTICATED') {
          setSignedWallet(null)
        }
        setError(describeChatError(failure))
        return false
      } finally {
        setBusy(false)
      }
    },
    [merge],
  )

  const setNickname = useCallback(async (value: string) => {
    setBusy(true)
    setError(null)
    try {
      const saved = await saveNickname(value)
      setNicknameState(saved.nickname)
      return true
    } catch (failure) {
      setError(describeChatError(failure))
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const clearNickname = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await removeNickname()
      setNicknameState(null)
    } catch (failure) {
      setError(describeChatError(failure))
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    messages,
    loading,
    unavailable,
    signedIn,
    nickname,
    error,
    busy,
    send,
    signIn,
    setNickname,
    clearNickname,
  }
}
