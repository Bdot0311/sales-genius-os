import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const FOUNDER_NAME = 'Brandon'
const SITE_NAME = 'OutReign'
const INTERVIEW_URL = 'https://buildpad.io/interview/wjq8qdee'

interface CustomerInterviewProps {
  name?: string
}

const CustomerInterviewEmail = ({ name }: CustomerInterviewProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Can I ask you something?</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `Hey ${name},` : 'Hey there,'}</Heading>
        <Text style={text}>
          You're one of a small number of people actually paying for {SITE_NAME}, and I want to
          understand why it worked for you when it doesn't for everyone.
        </Text>
        <Text style={text}>
          I'm doing a quick 7-minute voice interview with customers to figure out what's making
          the difference. It's a conversation, not a form — just click and talk.
        </Text>
        <Section style={ctaSection}>
          <Link href={INTERVIEW_URL} style={cta}>Start the 7-minute interview</Link>
        </Section>
        <Text style={text}>
          It would genuinely help me build a better product. And it takes less time than a coffee.
        </Text>
        <Text style={text}>Thanks,</Text>
        <Text style={signature}>
          — {FOUNDER_NAME}<br />
          Founder, {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CustomerInterviewEmail,
  subject: 'Can I ask you something?',
  displayName: 'Customer interview (paying users)',
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
