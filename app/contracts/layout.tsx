import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Contracts | POTS' }

export default function ContractsLayout({ children }: { children: ReactNode }) {
  return children
}
