import type { Metadata } from 'next'
import { InfoPage, InfoSection } from '@/components/layout/info-page'
import { v3Enabled } from '@/lib/contracts'

export const metadata: Metadata = { title: 'Privacy | POTS' }

export default function PrivacyPage() {
  return (
    <InfoPage
      title="Privacy"
      status="Draft pending legal review. This text is not final and is not legal advice."
    >
      <InfoSection title="What the app collects">
        <p>
          The app has no accounts and does not ask for a name, an email, or any personal data. Your
          wallet connection state is kept in your browser local storage so that you stay connected
          between visits.{' '}
          {v3Enabled
            ? 'If you open a referral link, the referrer address from the link is also kept there until you deploy for the first time.'
            : null}
        </p>
      </InfoSection>
      <InfoSection title="What is public">
        <p>
          Your wallet address, deploys, and claims are transactions on a public blockchain. Anyone
          can read them, and they cannot be deleted. The History, Stats, and Profile pages only show
          what is already public on the chain.
        </p>
      </InfoSection>
      <InfoSection title="Third parties">
        <p>
          The app reads the chain through a public RPC provider and an indexer, and it is hosted by
          a web hosting provider. Like any web request, they can see your IP address and the pages
          you load. Your wallet handles signing; the app never sees your keys.
        </p>
      </InfoSection>
    </InfoPage>
  )
}
