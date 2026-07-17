import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Hr, Section, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'OutReign'
const FOUNDER_NAME = 'Brandon'
const COMPANY_NAME = 'BDØT Industries'
const SUPPORT_EMAIL = 'support@bdotindustries.com'
const APP_URL = 'https://outreign.io'

interface OnboardingOfferProps {
  name?: string
}

const OnboardingOfferEmail = ({ name }: OnboardingOfferProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Want us to build your first campaign for you — free?</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `${name}, want a shortcut?` : 'Want a shortcut?'}
        </Heading>
        <Text style={text}>
          Most people who sign up for {SITE_NAME} have the same question in week one:
          <em> "Where do I actually start?"</em>
        </Text>
        <Text style={text}>
          So we're doing something we don't advertise on the site — for a limited number of new
          accounts, our team will personally help you go from zero to booked meetings. No cost,
          no upsell trap.
        </Text>

        <Section style={offerSection}>
          <Text style={offerHeading}>Here's what we can do for you (free):</Text>
          <Text style={offerItem}>→ Build your first ICP + lead list with you</Text>
          <Text style={offerItem}>→ Write your opening sequence in your voice</Text>
          <Text style={offerItem}>→ Set up tracking so you can see what's working</Text>
          <Text style={offerItem}>→ Coach you through your first booked meeting or closed deal</Text>
        </Section>

        <Text style={text}>
          If any of that sounds useful, just reply to this email with one of these:
        </Text>
        <Text style={optionText}><strong>"Campaign"</strong> — help me launch my first outbound campaign</Text>
        <Text style={optionText}><strong>"Meeting"</strong> — help me book my first meeting</Text>
        <Text style={optionText}><strong>"Deal"</strong> — help me close my first deal</Text>

        <Section style={ctaSection}>
          <Button href={`${APP_URL}/dashboard`} style={button}>
            Or jump into the app
          </Button>
        </Section>

        <Text style={text}>
          Either way, we're rooting for you. Reply anytime — a real human on our team reads every
          message.
        </Text>

        <Hr style={hr} />
        <Text style={signature}>
          — {FOUNDER_NAME} &amp; the {SITE_NAME} team<br />
          <Link href={`mailto:${SUPPORT_EMAIL}`} style={link}>{SUPPORT_EMAIL}</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: OnboardingOfferEmail,
  subject: 'Want us to launch your first campaign for you? (free)',
  displayName: 'Onboarding offer',
  previewData: { name: 'Alex' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#111827', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }
const offerSection = { backgroundColor: '#f5f3ff', borderLeft: '3px solid #7c3aed', borderRadius: '4px', padding: '20px 22px', margin: '24px 0' }
const offerHeading = { fontSize: '14px', fontWeight: '700' as const, color: '#111827', margin: '0 0 12px' }
const offerItem = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0 0 6px' }
const optionText = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0 0 8px' }
const ctaSection = { textAlign: 'center' as const, margin: '28px 0 24px' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '600' as const }
const link = { color: '#7c3aed', textDecoration: 'underline', fontWeight: '600' as const }
const hr = { borderColor: '#e5e7eb', margin: '32px 0 24px' }
const signature = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
