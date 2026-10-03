import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { SiteHeader } from '@/components/layout/site-header'
import { ConfigNotice } from '@/components/layout/config-notice'
import { SiteRail } from '@/components/layout/site-rail'
import { SiteTabbar } from '@/components/layout/site-tabbar'
import { NetworkBanner } from '@/components/wallet/network-banner'

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

// Lets the fixed tab bar use the device safe-area inset (notches and home indicators).
export const viewport: Viewport = { viewportFit: 'cover' }

export const metadata: Metadata = {
  title: 'POTS',
  description:
    'POTS: grid mining on Robinhood Chain. Pick blocks, deploy ETH, mine the POTS token.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>
        <Providers>
          <SiteHeader />
          <SiteRail />
          <main className="relative z-[1] mx-auto w-full max-w-[1180px] px-4 pt-6 pb-24 md:px-5 md:pb-10 lg:pl-[72px]">
            <ConfigNotice />
            <NetworkBanner />
            {children}
          </main>
          <SiteTabbar />
        </Providers>
      </body>
    </html>
  )
}
