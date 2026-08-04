import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section, Link, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'OutReign'
const FOUNDER_NAME = 'Brandon'
const SUPPORT_EMAIL = 'support@bdotindustries.com'
const APP_URL = 'https://outreign.io'
const GRANT_URL = `${APP_URL}/dashboard/settings?tab=support-access`

interface Props {
  name?: string
  note?: string
  days?: number
}

const Email = ({ name, note, days = 14 }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Grant us temporary access so we can build your campaigns</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `${name} — ready for us to build your campaigns?` : 'Ready for us to build your campaigns?'}
        </Heading>
        <Text style={text}>
          {note ? `${note} ` : ''}
          I'm {FOUNDER_NAME}, founder of {SITE_NAME}. My team can set up your first campaigns for you, but we
          need your permission first. Nobody on our side can enter your account without you approving it.
        </Text>

        <Section style={offerSection}>
          <Text style={offerHeading}>What granting access does:</Text>
          <Text style={offerItem}>→ Gives us read and write access to your ICP, sequences and drafts</Text>
          <Text style={offerItem}>→ Expires automatically after {days} days</Text>
          <Text style={offerItem}>→ Every action we take is logged for you to review</Text>
          <Text style={offerItem}>→ You can revoke it at any moment from Settings</Text>
        </Section>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={GRANT_URL} style={button}>
            Review and grant access
          </Button>
        </Section>

        <Text style={text}>
          Prefer to talk it through first? Just reply to this email.
        </Text>

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
  subject: 'Can we get access to set up your campaigns?',
  displayName: 'Campaign setup — access request (outbound)',
  previewData: { name: 'Alex', note: 'Following up on our call earlier today.', days: 14 },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#111827', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }

const offerSection = { backgroundColor: '#f5f3ff', borderLeft: '3px solid #7c3aed', borderRadius: '4px', padding: '20px 22px', margin: '24px 0' }
const offerHeading = { fontSize: '14px', fontWeight: '700' as const, color: '#111827', margin: '0 0 12px' }
const offerItem = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0 0 6px' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', padding: '13px 28px', borderRadius: '8px', fontSize: '15px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e5e7eb', margin: '32px 0 24px' }
const signature = { fontSize: '14px', color: '#6b7280', lineHeight: '1.7', margin: '0' }
const link = { color: '#7c3aed', textDecoration: 'underline' }
