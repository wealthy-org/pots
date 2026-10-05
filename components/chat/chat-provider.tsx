'use client'

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { ChatPanel } from '@/components/chat/chat-panel'
import { chatEnabled } from '@/lib/chat-flag'

type ChatControls = { enabled: boolean; open: boolean; setOpen: (open: boolean) => void }

const ChatContext = createContext<ChatControls>({ enabled: false, open: false, setOpen: () => {} })

export function useChatControls(): ChatControls {
  return useContext(ChatContext)
}

/** Holds the open state so the rail button, the More sheet, and the panel share it. */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const value = useMemo(() => ({ enabled: chatEnabled, open, setOpen }), [open])
  return (
    <ChatContext.Provider value={value}>
      {children}
      {chatEnabled ? <ChatPanel open={open} onClose={() => setOpen(false)} /> : null}
    </ChatContext.Provider>
  )
}
