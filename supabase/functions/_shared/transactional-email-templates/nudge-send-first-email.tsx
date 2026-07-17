import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Hr, Section, Link } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const APP_URL = 'https://outreign.io'
const SUPPORT_EMAIL = 'support@bdotindustries.com'

interface Props { name?: string }

const Email = ({ name }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Want us to draft your first outbound email for you?</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{name ? `${name}, want us to draft your first email?` : 'Want us to draft your first email?'}</Heading>
        <Text style={text}>
          Your mailbox is connected. Your leads are ready. The only thing missing is the first email —
          and we get it, that's the part everyone freezes on.
        </Text>
        <Text style={text}>
          Reply to this message with a one-line description of what you sell and who you're targeting,
          and we'll draft an opener you can send today. No template garbage — a real one written for
          your business.
        </Text>
        <Section style={box}>
          <Text style={boxTitle}>Or write your own in the app:</Text>
          <Text style={boxItem}>→ AI Coach helps you draft in your voice</Text>
          <Text style={boxItem}>→ Sequences send follow-ups automatically</Text>
          <Text style={boxItem}>→ Replies get tracked so you never miss one</Text>
        </Section>
        <Section style={ctaSection}>
          <Button href={`${APP_URL}/dashboard/sequences`} style={button}>Open sequences</Button>
        </Section>
        <Hr style={hr} />
        <Text style={sig}>— The OutReign team<br /><Link href={`mailto:${SUPPORT_EMAIL}`} style={link}>{SUPPORT_EMAIL}</Link></Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Want us to draft your first outbound email?',
  displayName: 'Nudge: send first email',
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
