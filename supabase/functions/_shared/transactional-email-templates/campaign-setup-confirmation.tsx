import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'OutReign'
const FOUNDER_NAME = 'Brandon'
const SUPPORT_EMAIL = 'support@bdotindustries.com'

interface Props {
  name?: string
}

const Email = ({ name }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We got your request — we'll set up your first campaigns.</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Thanks, ${name} — we've got it.` : "Thanks — we've got it."}
        </Heading>
        <Text style={text}>
          Your campaign setup request just landed in our inbox. A real human on our team will read it,
          review what you shared, and reply within one business day with next steps.
        </Text>

        <Section style={offerSection}>
          <Text style={offerHeading}>Here's what happens next:</Text>
          <Text style={offerItem}>→ We review your business + ideal customer</Text>
          <Text style={offerItem}>→ We draft your first ICP and lead list</Text>
          <Text style={offerItem}>→ We write your opening sequence in your voice</Text>
          <Text style={offerItem}>→ You approve everything before we launch a thing</Text>
        </Section>

        <Text style={text}>
          If anything else comes to mind before we get back to you, just reply to this email — it goes
          straight to us.
        </Text>

        <Hr style={hr} />
        <Text style={signature}>
          — {FOUNDER_NAME} &amp; the {SITE_NAME} team<br />
          <Link href={`mailto:${SUPPORT_EMAIL}`} style={link}>{SUPPORT_EMAIL}</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: "We got your request — let's set up your first campaigns",
  displayName: 'Campaign setup — user confirmation',
  previewData: { name: 'Alex' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#111827', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }
const offerSection = { backgroundColor: '#f5f3ff', borderLeft: '3px solid #7c3aed', borderRadius: '4px', padding: '20px 22px', margin: '24px 0' }
const offerHeading = { fontSize: '14px', fontWeight: '700' as const, color: '#111827', margin: '0 0 12px' }
const offerItem = { fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0 0 6px' }
const hr = { borderColor: '#e5e7eb', margin: '32px 0 24px' }
const signature = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
const link = { color: '#7c3aed', textDecoration: 'underline', fontWeight: '600' as const }
