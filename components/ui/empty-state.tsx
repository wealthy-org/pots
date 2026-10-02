import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-md border border-dashed border-line-2 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-text">{title}</p>
      {description ? (
        <p className="mx-auto mt-1.5 max-w-prose text-xs text-text-2">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}
