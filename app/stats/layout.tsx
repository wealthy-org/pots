import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Stats | POTS' }

export default function StatsLayout({ children }: { children: ReactNode }) {
  return children
}
