import type { ReactNode } from 'react'

export function ToastViewport({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-20 z-[60] flex w-full max-w-xs flex-col gap-2 md:bottom-4"
    >
      {children}
    </div>
  )
}

export function Toast({ title, description }: { title: string; description?: string }) {
  return (
    <div className="pointer-events-auto rounded-md border border-line-2 bg-[rgba(16,17,21,0.94)] px-3.5 py-2.5 text-sm shadow-[0_20px_50px_-16px_rgba(0,0,0,0.8)]">
      <p className="font-medium text-text">{title}</p>
      {description ? <p className="mt-0.5 font-mono text-xs text-text-2">{description}</p> : null}
    </div>
  )
}
