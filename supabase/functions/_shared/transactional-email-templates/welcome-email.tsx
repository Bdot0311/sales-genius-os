import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "OutReign"

interface WelcomeEmailProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — let's close more deals</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Heading style={logo}>{SITE_NAME}</Heading>
        </Section>
        <Heading style={h1}>
          {name ? `Welcome aboard, ${name}! 🚀` : 'Welcome aboard! 🚀'}
        </Heading>
        <Text style={text}>
          You've just joined the smartest outbound sales platform on the market. 
          Here's how to get started in under 5 minutes:
        </Text>
        <Section style={stepSection}>
          <Text style={stepText}><strong>1.</strong> Build your Ideal Customer Profile (ICP)</Text>
          <Text style={stepText}><strong>2.</strong> Search and save high-quality leads</Text>
          <Text style={stepText}><strong>3.</strong> Launch your first email sequence</Text>
        </Section>
        <Section style={ctaSection}>
          <Button style={button} href="https://sales-genius-os.lovable.app/dashboard">
            Go to Dashboard →
          </Button>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>
          Need help? Visit our Help Center or reply to this email.
        </Text>
        <Text style={footer}>
          — The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: 'Welcome to OutReign — let\'s close more deals',
  displayName: 'Welcome email',
  previewData: { name: 'Alex' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const headerSection = { marginBottom: '32px' }
const logo = { fontSize: '24px', fontWeight: '700' as const, color: '#7c3aed', margin: '0' }
const h1 = { fontSize: '26px', fontWeight: '700' as const, color: '#111827', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 24px' }
const stepSection = { backgroundColor: '#f9fafb', borderRadius: '8px', padding: '20px 24px', margin: '0 0 24px' }
const stepText = { fontSize: '14px', color: '#374151', lineHeight: '1.5', margin: '0 0 8px' }
const ctaSection = { textAlign: 'center' as const, margin: '0 0 32px' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 32px', borderRadius: '6px', fontSize: '15px', fontWeight: '600' as const, textDecoration: 'none' }
const hr = { borderColor: '#e5e7eb', margin: '32px 0' }
const footer = { fontSize: '13px', color: '#9ca3af', lineHeight: '1.5', margin: '0 0 8px' }
