'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useChat } from '@/hooks/use-chat'
import type { ChatMessage } from '@/lib/chat-client'
import { MAX_BODY_LENGTH } from '@/lib/chat-text'
import { avatarHue, shortenAddress } from '@/lib/format'

function Row({ message }: { message: ChatMessage }) {
  const name = message.nickname ?? shortenAddress(message.wallet)
  const time = new Date(message.createdAt)
  return (
    <li className="flex gap-2.5 px-4 py-2">
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-gold-ink"
        style={{
          background: `linear-gradient(135deg,hsl(${avatarHue(message.wallet)} 60% 72%),hsl(${avatarHue(message.wallet) + 10} 45% 42%))`,
        }}
      >
        {(message.nickname ?? message.wallet.slice(2))[0].toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-xs">
          <span className="min-w-0 truncate font-mono font-semibold text-text">{name}</span>
          <time dateTime={message.createdAt} title={time.toUTCString()} className="text-text-3">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
        </p>
        <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-text-2">{message.body}</p>
      </div>
    </li>
  )
}

/**
 * The chat of the current UTC day (SD-13). A non-modal dialog: a side panel next to the rail on
 * desktop, a bottom sheet below 1024 px. Plain text only; links are not clickable.
 */
export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isConnected } = useAccount()
  const chat = useChat(open)
  const ref = useRef<HTMLDialogElement>(null)
  const logRef = useRef<HTMLUListElement>(null)
  const [draft, setDraft] = useState('')
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [nicknameOpen, setNicknameOpen] = useState(false)
  const [atBottom, setAtBottom] = useState(true)
  const [unread, setUnread] = useState(false)
  const lastCount = useRef(0)
  const opener = useRef<HTMLElement | null>(null)
  const messageId = useId()
  const nicknameId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.show()
      // A non-modal dialog does not take focus by itself: move it in, so Escape and Tab start here.
      dialog.focus()
    }
    if (!open && dialog.open) {
      dialog.close()
      // Give the focus back to the control that opened the panel.
      opener.current?.focus()
      opener.current = null
    }
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Stay at the bottom while the reader is there; otherwise offer a pill and keep the scroll still.
  useLayoutEffect(() => {
    const list = logRef.current
    if (!list || chat.messages.length === lastCount.current) return
    const grew = chat.messages.length > lastCount.current
    lastCount.current = chat.messages.length
    if (atBottom) {
      list.scrollTop = list.scrollHeight
    } else if (grew) {
      setUnread(true)
    }
  }, [chat.messages, atBottom])

  function onScroll() {
    const list = logRef.current
    if (!list) return
    const near = list.scrollHeight - list.scrollTop - list.clientHeight < 40
    setAtBottom(near)
    if (near) setUnread(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || chat.busy) return
    if (await chat.send(text)) {
      setDraft('')
      setAtBottom(true)
    }
  }

  const count = Array.from(draft).length
  const canWrite = isConnected && chat.signedIn

  return (
    <dialog
      ref={ref}
      aria-label="Chat"
      tabIndex={-1}
      className="fixed right-0 bottom-0 left-0 z-[70] m-0 flex h-[min(85dvh,640px)] w-full max-w-none flex-col rounded-t-xl border border-line-2 bg-bg-elev p-0 text-text shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.8)] not-open:hidden max-md:pb-[env(safe-area-inset-bottom)] lg:top-20 lg:right-auto lg:bottom-4 lg:left-[64px] lg:h-auto lg:w-[360px] lg:rounded-xl"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Chat</h2>
          <p className="mt-0.5 text-[11px] text-text-2">Clears every day at 00:00 UTC</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="grid h-9 w-9 place-items-center rounded-md text-text-2 hover:bg-white/[0.04] hover:text-text max-md:h-11 max-md:w-11"
        >
          <svg
            viewBox="0 0 14 14"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        {chat.unavailable ? (
          <p role="status" className="px-4 py-6 text-sm text-text-2">
            Chat is unavailable right now.
          </p>
        ) : chat.loading ? (
          <div className="flex flex-col gap-3 px-4 py-4" aria-hidden="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-4/5" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            {chat.messages.length === 0 ? (
              <p className="px-4 py-6 text-sm text-text-2">
                No messages today. Chat clears every day at 00:00 UTC.
              </p>
            ) : null}
            <ul
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-label="Messages"
              tabIndex={0}
              onScroll={onScroll}
              className={`overflow-y-auto py-1 ${
                chat.messages.length === 0
                  ? 'sr-only'
                  : 'h-full max-h-[calc(85dvh-14rem)] lg:max-h-[calc(100dvh-20rem)]'
              }`}
            >
              {chat.messages.map((message) => (
                <Row key={message.id} message={message} />
              ))}
            </ul>
          </>
        )}{' '}
        {unread ? (
          <button
            type="button"
            onClick={() => {
              const list = logRef.current
              if (list) list.scrollTop = list.scrollHeight
              setUnread(false)
            }}
            className="absolute bottom-2 left-1/2 min-h-11 -translate-x-1/2 rounded-full border border-gold/50 bg-bg px-4 text-xs font-semibold text-gold shadow-lg"
          >
            New messages
          </button>
        ) : null}
      </div>

      <div className="border-t border-line px-4 py-3">
        {chat.error ? (
          <p role="alert" className="mb-2 text-xs text-loss">
            {chat.error}
          </p>
        ) : null}

        {!isConnected ? (
          <>
            <label
              htmlFor={messageId}
              className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase"
            >
              Message
            </label>
            <input
              id={messageId}
              disabled
              placeholder="Connect wallet to chat"
              className="mt-1.5 min-h-11 w-full rounded-md border border-line-2 bg-bg px-3 text-sm opacity-60"
            />
          </>
        ) : !chat.signedIn ? (
          <div>
            <Button className="w-full" onClick={() => void chat.signIn()} disabled={chat.busy}>
              {chat.busy ? 'Waiting for the wallet...' : 'Sign in to chat'}
            </Button>
            <p className="mt-2 text-[11px] text-text-2">
              Signing proves you own the wallet. It costs no gas.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor={messageId}
                className="text-[11px] font-semibold tracking-[0.16em] text-text-2 uppercase"
              >
                Message
              </label>
              <span
                className={`font-mono text-[11px] ${count > MAX_BODY_LENGTH ? 'text-loss' : 'text-text-3'}`}
              >
                {count}/{MAX_BODY_LENGTH}
              </span>
            </div>
            <div className="flex gap-2">
              <textarea
                id={messageId}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                rows={2}
                autoComplete="off"
                className="min-h-11 min-w-0 flex-1 resize-none rounded-md border border-line-2 bg-bg px-3 py-2 text-sm outline-none focus-visible:border-gold"
              />
              <Button
                type="submit"
                disabled={!canWrite || chat.busy || count < 1 || count > MAX_BODY_LENGTH}
                aria-label="Send message"
              >
                {chat.busy ? 'Sending' : 'Send'}
              </Button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-text-2">
              <span>
                {chat.nickname ? (
                  <>
                    Nickname <span className="font-mono text-text">{chat.nickname}</span>
                  </>
                ) : (
                  'No nickname: your address is shown'
                )}
              </span>
              <button
                type="button"
                onClick={() => setNicknameOpen((value) => !value)}
                aria-expanded={nicknameOpen}
                className="min-h-11 px-2 underline underline-offset-4 hover:text-text"
              >
                {chat.nickname ? 'Change' : 'Set nickname'}
              </button>
            </div>
            {nicknameOpen ? (
              <div className="flex flex-col gap-1.5 rounded-md border border-line p-2.5">
                <label htmlFor={nicknameId} className="text-[11px] text-text-2">
                  3 to 16 letters, digits, or underscores
                </label>
                <div className="flex gap-2">
                  <input
                    id={nicknameId}
                    value={nicknameDraft}
                    onChange={(event) => setNicknameDraft(event.target.value.trim())}
                    maxLength={16}
                    autoComplete="off"
                    spellCheck={false}
                    className="min-h-11 min-w-0 flex-1 rounded-md border border-line-2 bg-bg px-3 font-mono text-sm outline-none focus-visible:border-gold"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={chat.busy || nicknameDraft.length < 3}
                    onClick={async () => {
                      if (await chat.setNickname(nicknameDraft)) {
                        setNicknameDraft('')
                        setNicknameOpen(false)
                      }
                    }}
                  >
                    Save
                  </Button>
                </div>
                {chat.nickname ? (
                  <button
                    type="button"
                    onClick={() => void chat.clearNickname()}
                    className="min-h-11 self-start px-1 text-[11px] text-text-2 underline underline-offset-4 hover:text-text"
                  >
                    Remove nickname
                  </button>
                ) : null}
              </div>
            ) : null}
          </form>
        )}
      </div>
    </dialog>
  )
}
