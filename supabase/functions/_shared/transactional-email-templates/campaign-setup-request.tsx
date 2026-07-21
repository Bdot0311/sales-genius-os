import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  name?: string
  email?: string
  company?: string
  website?: string
  audience?: string
  goal?: string
  submittedAt?: string
}

const Row = ({ label, value }: { label: string; value?: string }) => (
  <Section style={row}>
    <Text style={rowLabel}>{label}</Text>
    <Text style={rowValue}>{value && value.trim() ? value : '—'}</Text>
  </Section>
)

const Email = ({ name, email, company, website, audience, goal, submittedAt }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New campaign setup request from {name || email || 'a new user'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New campaign setup request</Heading>
        <Text style={intro}>
          A free-tier user just requested help launching their first campaigns via the OutReign pricing page.
        </Text>

        <Row label="Name" value={name} />
        <Row label="Email" value={email} />
        <Row label="Company" value={company} />
        <Row label="Website" value={website} />
        <Row label="Ideal customer" value={audience} />
        <Row label="Goal for outbound" value={goal} />

        <Hr style={hr} />
        <Text style={meta}>
          Submitted {submittedAt || 'just now'}. Reply directly to{' '}
          <Link href={`mailto:${email || ''}`} style={link}>{email || 'the user'}</Link> to kick things off.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `New campaign setup request — ${data.name || data.email || 'new user'}`,
  displayName: 'Campaign setup — internal notification',
  previewData: {
    name: 'Jane Doe',
    email: 'jane@acme.com',
    company: 'Acme Inc.',
    website: 'https://acme.com',
    audience: 'Heads of RevOps at 20–200 person B2B SaaS',
    goal: 'Book 5 discovery calls this month',
    submittedAt: 'Jan 1, 2026 at 10:00 AM UTC',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#111827', margin: '0 0 12px', lineHeight: '1.3' }
const intro = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0 0 24px' }
const row = { margin: '0 0 14px', padding: '0' }
const rowLabel = { fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px', fontWeight: '600' as const }
const rowValue = { fontSize: '15px', color: '#111827', lineHeight: '1.5', margin: '0', whiteSpace: 'pre-wrap' as const }
const hr = { borderColor: '#e5e7eb', margin: '24px 0 16px' }
const meta = { fontSize: '13px', color: '#6b7280', lineHeight: '1.6', margin: '0' }
const link = { color: '#7c3aed', textDecoration: 'underline', fontWeight: '600' as const }
