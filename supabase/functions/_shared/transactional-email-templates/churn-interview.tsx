import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const FOUNDER_NAME = 'Brandon'
const SITE_NAME = 'OutReign'
const INTERVIEW_URL = 'https://buildpad.io/interview/te47bpsx'

interface ChurnInterviewProps {
  name?: string
}

const ChurnInterviewEmail = ({ name }: ChurnInterviewProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>A quick question from the founder</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Hey ${name},` : 'Hey there,'}</Heading>
        <Text style={text}>
          You signed up for {SITE_NAME} a while back but never ended up upgrading — and I'd love
          to understand why.
        </Text>
        <Text style={text}>
          I'm not trying to win you back. I'm genuinely trying to figure out what wasn't working
          so I can fix it. Even if you just poked around for five minutes and moved on, that's
          useful.
        </Text>
        <Text style={text}>
          I set up a short 7-minute voice interview (it's a conversation, not a form). No
          scheduling needed — just click and talk when you have a moment.
        </Text>
        <Section style={ctaSection}>
          <Link href={INTERVIEW_URL} style={cta}>Start the 7-minute interview</Link>
        </Section>
        <Text style={text}>Thanks either way.</Text>
        <Text style={signature}>
          — {FOUNDER_NAME}<br />
          Founder, {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ChurnInterviewEmail,
  subject: 'A quick question from the founder',
  displayName: 'Churn interview (free users)',
  previewData: { name: 'Alex' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#111827', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }
const ctaSection = { margin: '28px 0' }
const cta = {
  display: 'inline-block',
  backgroundColor: '#7c3aed',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600' as const,
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
}
const signature = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
