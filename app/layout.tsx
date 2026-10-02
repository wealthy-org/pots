import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteTabbar } from '@/components/layout/site-tabbar'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'POTS',
  description: 'POTS: grid mining on Robinhood Chain. Pick blocks, deploy ETH, mine POTS.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <SiteHeader />
        <main className="relative z-[1] mx-auto w-full max-w-[1180px] px-4 pt-6 pb-24 md:px-5 md:pb-10">
          {children}
        </main>
        <SiteTabbar />
      </body>
    </html>
  )
}
