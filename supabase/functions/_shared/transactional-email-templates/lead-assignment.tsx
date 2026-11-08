import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Section } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const APP_URL = 'https://outreign.io'

interface Props {
  count?: number
  assignerName?: string
}

const Email = ({ count = 1, assignerName }: Props) => {
  const label = count === 1 ? '1 new lead' : `${count} new leads`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`You've been assigned ${label}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{`You've been assigned ${label}`}</Heading>
          <Text style={text}>
            {assignerName ? `${assignerName} assigned` : 'Your team assigned'} {label} to you in OutReign. Open your dashboard to review them.
          </Text>
          <Section style={ctaSection}>
            <Button href={`${APP_URL}/dashboard/saved-leads`} style={button}>Review leads</Button>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const n = Number(data?.count) || 1
    return n === 1 ? "You've been assigned 1 new lead" : `You've been assigned ${n} new leads`
  },
  displayName: 'Lead assignment notice',
  previewData: { count: 3, assignerName: 'Brandon' },
}

const main = { backgroundColor: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '32px 28px', maxWidth: '560px', borderRadius: '10px' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#111827', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const ctaSection = { textAlign: 'center' as const, margin: '28px 0 20px' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '600' as const }
