'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { useAccount, useDisconnect } from 'wagmi'
import { Button } from '@/components/ui/button'
import { useWalletConnect } from '@/hooks/use-wallet-connect'
import { shortenAddress } from '@/lib/format'

const itemClass =
  'flex min-h-11 items-center rounded px-3 text-left text-sm text-text-2 hover:bg-white/[0.04] hover:text-text'

export function ConnectButton() {
  const { address, isConnected } = useAccount()
  const wallet = useWalletConnect()
  const { disconnect } = useDisconnect()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) {
      return
    }
    function onPointerDown(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (isConnected && address) {
    // A disclosure: a button that shows a short list of a link and a button, in tab order.
    return (
      <div
        ref={root}
        className="relative"
        onBlur={(event) => {
          // Tabbing out of the menu closes it.
          if (open && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setOpen(false)
          }
        }}
      >
        <Button
          ref={trigger}
          variant="secondary"
          size="sm"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((value) => !value)}
        >
          {shortenAddress(address)}
        </Button>
        {open ? (
          <div
            id={menuId}
            className="absolute right-0 z-50 mt-2 flex w-40 flex-col rounded-md border border-line-2 bg-bg-elev p-1 shadow-lg"
          >
            <Link href="/profile" onClick={() => setOpen(false)} className={itemClass}>
              Profile
            </Link>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                disconnect()
              }}
              className={itemClass}
            >
              Disconnect
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  if (!wallet.available) {
    return (
      <Button variant="secondary" size="sm" disabled title="Install MetaMask or Phantom EVM">
        No wallet detected
      </Button>
    )
  }

  return (
    <>
      <Button size="sm" onClick={wallet.connect} disabled={wallet.isPending}>
        {wallet.isPending ? 'Connecting...' : 'Connect wallet'}
      </Button>
      {wallet.message ? (
        <span role="alert" className="sr-only">
          {wallet.message}
        </span>
      ) : null}
    </>
  )
}
