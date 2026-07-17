import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Hr, Section, Link } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const APP_URL = 'https://outreign.io'
const SUPPORT_EMAIL = 'support@bdotindustries.com'

interface Props { name?: string }

const Email = ({ name }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Try your first lead search — it takes 30 seconds</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `${name}, ready to try your first search?` : 'Ready to try your first search?'}</Heading>
        <Text style={text}>
          You signed up for OutReign — welcome. The single fastest way to see the value is to run
          one lead search. It takes about 30 seconds.
        </Text>
        <Section style={box}>
          <Text style={boxTitle}>Try one of these in plain English:</Text>
          <Text style={boxItem}>→ "Head of marketing at B2B SaaS in the US, 50–200 employees"</Text>
          <Text style={boxItem}>→ "Founders of e-commerce brands doing $1M–$10M in revenue"</Text>
          <Text style={boxItem}>→ "VP Sales at fintech companies in the UK"</Text>
        </Section>
        <Section style={ctaSection}>
          <Button href={`${APP_URL}/dashboard/leads`} style={button}>Run my first search</Button>
        </Section>
        <Text style={text}>
          Stuck? Reply to this email and we'll build the search with you.
        </Text>
        <Hr style={hr} />
        <Text style={sig}>— The OutReign team<br /><Link href={`mailto:${SUPPORT_EMAIL}`} style={link}>{SUPPORT_EMAIL}</Link></Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Your first lead search takes 30 seconds',
  displayName: 'Nudge: run first search',
  previewData: { name: 'Alex' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#111827', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }
const box = { backgroundColor: '#f5f3ff', borderLeft: '3px solid #7c3aed', borderRadius: '4px', padding: '18px 22px', margin: '20px 0' }
const boxTitle = { fontSize: '14px', fontWeight: '700' as const, color: '#111827', margin: '0 0 10px' }
const boxItem = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0 0 6px' }
const ctaSection = { textAlign: 'center' as const, margin: '28px 0 24px' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '600' as const }
const link = { color: '#7c3aed', textDecoration: 'underline', fontWeight: '600' as const }
const hr = { borderColor: '#e5e7eb', margin: '32px 0 24px' }
const sig = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
