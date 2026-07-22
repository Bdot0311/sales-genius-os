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
    <Preview>Haven't seen you in a while — want us to set your campaigns up for you?</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `${name} — we haven't seen you in a while` : "We haven't seen you in a while"}
        </Heading>
        <Text style={text}>
          I'm {FOUNDER_NAME}, founder of {SITE_NAME}. You signed up a while back and haven't been on the
          platform lately — no judgement, outbound is a lot to get off the ground.
        </Text>
        <Text style={text}>
          Here's the offer: <strong>my team and I will set your first campaigns up for you, free.</strong>
          We'll build your ICP, source your first lead list, write your opening sequence in your voice,
          and walk you through the ropes so you can run it yourself after.
        </Text>

        <Section style={offerSection}>
          <Text style={offerHeading}>And if the results meet your expectations:</Text>
          <Text style={offerBig}>We'll give you a full month of {SITE_NAME} on the house.</Text>
          <Text style={offerFine}>No card, no strings. Just come back, let us prove it works, and if it does — the next month is on us.</Text>
        </Section>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={`${APP_URL}/pricing`} style={button}>
            Yes, set my campaigns up
          </Button>
        </Section>

        <Text style={text}>
          Or just reply to this email with a sentence about who you sell to and I'll take it from there
          personally.
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
  subject: "Haven't seen you in a while — want us to set your campaigns up for you?",
  displayName: 'Campaign setup — winback (inactive users, free month offer)',
  previewData: { name: 'Alex' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#111827', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }
const offerSection = { backgroundColor: '#f5f3ff', borderLeft: '3px solid #7c3aed', borderRadius: '4px', padding: '22px 24px', margin: '24px 0' }
const offerHeading = { fontSize: '14px', fontWeight: '700' as const, color: '#111827', margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.03em' }
const offerBig = { fontSize: '17px', fontWeight: '700' as const, color: '#7c3aed', lineHeight: '1.4', margin: '0 0 10px' }
const offerFine = { fontSize: '13px', color: '#6b7280', lineHeight: '1.6', margin: '0' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', padding: '13px 28px', borderRadius: '8px', fontSize: '15px', fontWeight: '600' as const, textDecoration: 'none', display: 'inline-block' }
const hr = { borderColor: '#e5e7eb', margin: '32px 0 24px' }
const signature = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
const link = { color: '#7c3aed', textDecoration: 'underline', fontWeight: '600' as const }
