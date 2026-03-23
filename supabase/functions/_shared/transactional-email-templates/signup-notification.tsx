import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "SalesOS"
const ADMIN_EMAIL = Deno.env.get('NOTIFICATION_EMAIL') || ''

interface SignupNotificationProps {
  userName?: string
  userEmail?: string
  plan?: string
  signupDate?: string
}

const SignupNotificationEmail = ({ userName, userEmail, plan, signupDate }: SignupNotificationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New signup: {userName || userEmail || 'Unknown user'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={headerSection}>
          <Heading style={logo}>{SITE_NAME} Admin</Heading>
        </Section>
        <Heading style={h1}>🎉 New User Signup</Heading>
        <Section style={detailsSection}>
          <Text style={detailRow}><strong>Name:</strong> {userName || 'Not provided'}</Text>
          <Text style={detailRow}><strong>Email:</strong> {userEmail || 'Not provided'}</Text>
          <Text style={detailRow}><strong>Plan:</strong> {plan || 'Free'}</Text>
          <Text style={detailRow}><strong>Date:</strong> {signupDate || new Date().toLocaleDateString()}</Text>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>This is an automated notification from {SITE_NAME}.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SignupNotificationEmail,
  subject: (data: Record<string, any>) => `New signup: ${data.userName || data.userEmail || 'New user'}`,
  displayName: 'Admin signup notification',
  to: ADMIN_EMAIL,
  previewData: { userName: 'Alex Johnson', userEmail: 'alex@example.com', plan: 'Free', signupDate: '2026-03-23' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { padding: '40px 24px', maxWidth: '560px', margin: '0 auto' }
const headerSection = { marginBottom: '24px' }
const logo = { fontSize: '20px', fontWeight: '700' as const, color: '#7c3aed', margin: '0' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#111827', margin: '0 0 20px' }
const detailsSection = { backgroundColor: '#f9fafb', borderRadius: '8px', padding: '16px 20px', margin: '0 0 24px' }
const detailRow = { fontSize: '14px', color: '#374151', lineHeight: '1.5', margin: '0 0 6px' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0' }
const footer = { fontSize: '12px', color: '#9ca3af', margin: '0' }
