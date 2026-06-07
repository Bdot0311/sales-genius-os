import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "SalesOS"
const APP_URL = "https://salesos.alephwavex.io"

interface ReEngagementEmailProps {
  name?: string
  daysInactive?: number
}

const ReEngagementEmail = ({ name, daysInactive }: ReEngagementEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We miss you at {SITE_NAME} — anything we can do better?</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Heading style={logo}>{SITE_NAME}</Heading>
        </Section>
        <Heading style={h1}>
          {name ? `Hey ${name}, we miss you` : 'We miss you'}
        </Heading>
        <Text style={text}>
          {daysInactive
            ? `It's been about ${daysInactive} days since you last signed in to ${SITE_NAME}, and I wanted to check in personally.`
            : `It's been a little while since you last signed in to ${SITE_NAME}, and I wanted to check in personally.`}
        </Text>
        <Text style={text}>
          I'd genuinely love to know — what got in the way? A few quick options:
        </Text>
        <Section style={stepSection}>
          <Text style={stepText}>• The product didn't quite fit what you needed</Text>
          <Text style={stepText}>• You got stuck somewhere and didn't know who to ask</Text>
          <Text style={stepText}>• The pricing or plan wasn't right for you</Text>
          <Text style={stepText}>• You just got busy and haven't had a chance to come back</Text>
        </Section>
        <Text style={text}>
          Whatever the reason, just hit reply and tell me. I read every response, and your
          feedback directly shapes what we build next. If there's something we can fix or
          help you with, I want to make it right.
        </Text>
        <Section style={ctaSection}>
          <Button style={button} href={`${APP_URL}/dashboard`}>
            Take another look →
          </Button>
        </Section>
        <Text style={text}>
          Or if you'd rather just tell me what didn't work, reply to this email — no
          template, no survey, just a real conversation.
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
  subject: 'Anything we could do better?',
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
