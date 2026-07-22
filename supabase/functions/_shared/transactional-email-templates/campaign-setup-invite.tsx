import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section, Link, Button,
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
    <Preview>Want us to set up your first campaigns for you?</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `${name} — want us to set up your first campaigns?` : 'Want us to set up your first campaigns?'}
        </Heading>
        <Text style={text}>
          I'm {FOUNDER_NAME}, founder of {SITE_NAME}. You signed up recently and I wanted to reach out personally.
        </Text>
        <Text style={text}>
          If you'd like, my team and I will set up your first few campaigns for you — free. We'll build
          your ICP, source the lead list, and write your opening sequence in your voice. You approve
          everything before a single email goes out.
        </Text>

        <Section style={offerSection}>
          <Text style={offerHeading}>What we do for you:</Text>
          <Text style={offerItem}>→ Review your business and ideal customer</Text>
          <Text style={offerItem}>→ Draft your first ICP and lead list</Text>
          <Text style={offerItem}>→ Write your opening outreach sequence</Text>
          <Text style={offerItem}>→ Show you the ropes so you can run it yourself after</Text>
        </Section>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={`${APP_URL}/pricing`} style={button}>
            Request campaign setup
          </Button>
        </Section>

        <Text style={text}>
          Or just reply to this email with a sentence about who you sell to and I'll take it from there.
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
  subject: 'Want us to set up your first campaigns for you?',
  displayName: 'Campaign setup — invitation (active users)',
  previewData: { name: 'Alex' },
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
const signature = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
const link = { color: '#7c3aed', textDecoration: 'underline', fontWeight: '600' as const }
