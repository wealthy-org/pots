import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Fairness | POTS' }

export default function FairnessLayout({ children }: { children: ReactNode }) {
  return children
}
