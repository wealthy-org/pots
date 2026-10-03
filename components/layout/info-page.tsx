import type { ReactNode } from 'react'

export function InfoPage({
  title,
  intro,
  status,
  children,
}: {
  title: string
  intro?: string
  status?: string
  children: ReactNode
}) {
  return (
    <article className="mx-auto flex max-w-[720px] flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{title}</h1>
        {intro ? <p className="mt-2 text-sm text-text-2">{intro}</p> : null}
        {status ? (
          <p
            role="note"
            className="mt-3 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold-1"
          >
            {status}
          </p>
        ) : null}
      </header>
      {children}
    </article>
  )
}

export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 text-sm text-text-2">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {children}
    </section>
  )
}
