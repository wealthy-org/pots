import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Mine | POTS' }

export default function MineLayout({ children }: { children: ReactNode }) {
  return children
}
