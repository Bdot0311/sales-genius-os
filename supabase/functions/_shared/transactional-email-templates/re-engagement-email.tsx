import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "OutReign"
const APP_URL = Deno.env.get("APP_URL") ?? "https://outreign.io"

interface ReEngagementEmailProps {
  name?: string
  daysInactive?: number
}

const ReEngagementEmail = ({ name, daysInactive }: ReEngagementEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Where did we drop the ball? Reply and get a free month on us.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Heading style={logo}>{SITE_NAME}</Heading>
        </Section>
        <Heading style={h1}>
          {name ? `${name}, where did we go wrong?` : 'Where did we go wrong?'}
        </Heading>
        <Text style={text}>
          {daysInactive
            ? `It's been about ${daysInactive} days since you last signed in to ${SITE_NAME}, and I'd rather hear the honest reason than guess.`
            : `It's been a while since you last signed in to ${SITE_NAME}, and I'd rather hear the honest reason than guess.`}
        </Text>
        <Text style={text}>
          Would you mind replying with a few words on any of these? Even one‑liners help us do better:
        </Text>
        <Section style={stepSection}>
          <Text style={stepText}>• Where did we drop the ball for you?</Text>
          <Text style={stepText}>• Which features didn't land, or felt half‑baked?</Text>
          <Text style={stepText}>• What did you wish OutReign had that it doesn't?</Text>
          <Text style={stepText}>• Was pricing, onboarding, or something else the blocker?</Text>
          <Text style={stepText}>• What would have made you stay?</Text>
        </Section>
        <Section style={offerSection}>
          <Text style={offerTitle}>Come back on us — 1 month free, full access</Text>
          <Text style={offerText}>
            If you're open to giving us another shot, reply to this email and I'll personally
            comp your next month with full access to every feature. No card changes, no catch —
            just a chance to earn your trust back.
          </Text>
        </Section>
        <Section style={ctaSection}>
          <Button style={button} href={`${APP_URL}/dashboard`}>
            Take another look →
          </Button>
        </Section>
        <Text style={text}>
          Or just hit reply with the raw feedback — no survey, no template. I read every response.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          — Brandon, founder of {SITE_NAME}
        </Text>
        <Text style={footer}>
          <Link href={`${APP_URL}/dashboard`} style={footerLink}>Sign back in</Link>
          {' · '}
          <Link href="mailto:brandon@bdotindustries.com" style={footerLink}>Email me directly</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ReEngagementEmail,
  subject: 'Where did we drop the ball? (1 month free if you come back)',
  displayName: 'Re-engagement check-in',
  previewData: { name: 'Alex', daysInactive: 21 },
} satisfies TemplateEntry


const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const headerSection = { marginBottom: '32px' }
const logo = { fontSize: '24px', fontWeight: '700' as const, color: '#7c3aed', margin: '0' }
const h1 = { fontSize: '26px', fontWeight: '700' as const, color: '#111827', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const stepSection = { backgroundColor: '#f9fafb', borderRadius: '8px', padding: '20px 24px', margin: '0 0 24px' }
const stepText = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0 0 6px' }
const ctaSection = { textAlign: 'center' as const, margin: '24px 0 24px' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 32px', borderRadius: '6px', fontSize: '15px', fontWeight: '600' as const, textDecoration: 'none' }
const hr = { borderColor: '#e5e7eb', margin: '32px 0' }
const footer = { fontSize: '13px', color: '#9ca3af', lineHeight: '1.5', margin: '0 0 8px' }
const footerLink = { color: '#7c3aed', textDecoration: 'none' }
