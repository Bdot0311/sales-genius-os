import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "SalesOS"
const FOUNDER_NAME = "Brandon"
const COMPANY_NAME = "BDØT Industries"
const SUPPORT_EMAIL = "support@bdotindustries.com"

interface FounderNoteProps {
  name?: string
}

const FounderNoteEmail = ({ name }: FounderNoteProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>A quick note from {FOUNDER_NAME}, founder of {COMPANY_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Hey ${name},` : 'Hey there,'}
        </Heading>
        <Text style={text}>
          I'm {FOUNDER_NAME}, founder of {COMPANY_NAME} — the team behind {SITE_NAME}.
        </Text>
        <Text style={text}>
          I just wanted to personally say how happy I am that you joined us. We built {SITE_NAME} 
          because we were tired of bloated, overpriced sales tools that made outbound feel like 
          a chore. Our mission is simple: give founders, sales teams, and agencies the 
          infrastructure to close more deals — without the noise.
        </Text>
        <Text style={text}>
          You're not just another user to us. Every signup matters, and your feedback directly 
          shapes what we build next. So if you have ideas, questions, frustrations, or just want 
          to say hi — please reach out.
        </Text>
        <Section style={highlightSection}>
          <Text style={highlightText}>
            Questions or concerns? Email our support team at{' '}
            <Link href={`mailto:${SUPPORT_EMAIL}`} style={link}>{SUPPORT_EMAIL}</Link>
          </Text>
        </Section>
        <Text style={text}>
          Thanks for trusting us with your outbound. Let's go build something great together.
        </Text>
        <Hr style={hr} />
        <Text style={signature}>
          — {FOUNDER_NAME}<br />
          Founder, {COMPANY_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: FounderNoteEmail,
  subject: `A quick note from ${FOUNDER_NAME} at ${COMPANY_NAME}`,
  displayName: 'Founder note',
  previewData: { name: 'Alex' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#111827', margin: '0 0 20px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.7', margin: '0 0 18px' }
const highlightSection = { backgroundColor: '#f5f3ff', borderLeft: '3px solid #7c3aed', borderRadius: '4px', padding: '16px 20px', margin: '24px 0' }
const highlightText = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
const link = { color: '#7c3aed', textDecoration: 'underline', fontWeight: '600' as const }
const hr = { borderColor: '#e5e7eb', margin: '32px 0 24px' }
const signature = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
