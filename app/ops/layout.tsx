import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = { title: 'Operator | POTS' }

export default function OperatorLayout({ children }: { children: ReactNode }) {
  return children
}
