import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const APP_URL = 'https://outreign.io'

interface Props {
  summary?: string
  waiting?: number
  mission?: string
}

const Email = ({ summary, waiting = 0, mission }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{summary || 'Your agent finished a mission'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>{mission ? `${mission} finished` : 'Your agent finished a mission'}</Heading>
        <Text style={text}>{summary || 'Open Missions for what it did, what is waiting, and what it skipped.'}</Text>
        {waiting > 0 ? (
          <Text style={text}>
            {waiting === 1 ? '1 draft is waiting for your approval.' : `${waiting} drafts are waiting for your approval.`}
          </Text>
        ) : null}
        <Section style={ctaSection}>
          <Button href={`${APP_URL}/dashboard/missions`} style={button}>Review the mission</Button>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template: TemplateEntry = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const waiting = Number(data?.waiting) || 0
    return waiting > 0 ? 'Drafts from your agent are waiting' : 'Your agent finished a mission'
  },
  displayName: 'Agent mission digest',
  previewData: { summary: 'Overnight: 4 new leads, 3 drafts, 1 waiting for approval.', waiting: 1, mission: 'Find ops leads' },
}

const main = { backgroundColor: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '32px 28px', maxWidth: '560px', borderRadius: '10px' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#111827', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const ctaSection = { textAlign: 'center' as const, margin: '28px 0 20px' }
const button = { backgroundColor: '#512795', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '600' as const }
