import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Text, Hr, Section, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'OutReign'
const FOUNDER_NAME = 'Brandon'
const SUPPORT_EMAIL = 'support@bdotindustries.com'
const APP_URL = 'https://outreign.io'

interface Props {
  name?: string
}

const Email = ({ name }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You signed up, but never got a chance to try OutReign</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Hey ${name},` : 'Hey there,'}</Heading>
        <Text style={text}>
          I noticed you signed up for {SITE_NAME}, but never got a chance to open the platform.
          I wanted to check in personally and ask: did something get in your way, or was anything
          confusing when you signed up?
        </Text>
        <Text style={text}>
          If you need help getting started, reply to this email. I read every response and I’m happy
          to help you directly.
        </Text>
        <Section style={offerSection}>
          <Text style={offerHeading}>I’ll set up your first campaign for free.</Text>
          <Text style={offerText}>
            Send me a sentence about what you sell and who you want to reach. I’ll help build your
            audience, lead list, and opening email campaign so you can see how everything works.
          </Text>
        </Section>
        <Section style={ctaSection}>
          <Button href={`${APP_URL}/auth`} style={button}>Open OutReign</Button>
        </Section>
        <Text style={text}>Is there anything I can help you with?</Text>
        <Hr style={hr} />
        <Text style={signature}>
          — {FOUNDER_NAME}<br />
          Founder, {SITE_NAME}<br />
          <Link href={`mailto:${SUPPORT_EMAIL}`} style={link}>{SUPPORT_EMAIL}</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Did something get in the way?',
  displayName: 'Inactive signup — founder check-in',
  previewData: { name: 'Samuel' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#111827', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }
const offerSection = { backgroundColor: '#f5f3ff', borderLeft: '3px solid #7c3aed', borderRadius: '4px', padding: '20px 22px', margin: '24px 0' }
const offerHeading = { fontSize: '15px', fontWeight: '700' as const, color: '#111827', margin: '0 0 8px' }
const offerText = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0' }
const ctaSection = { textAlign: 'center' as const, margin: '28px 0' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', padding: '13px 28px', borderRadius: '8px', fontSize: '15px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e5e7eb', margin: '32px 0 24px' }
const signature = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
const link = { color: '#7c3aed', textDecoration: 'underline', fontWeight: '600' as const }