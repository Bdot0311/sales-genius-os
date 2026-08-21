import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Text, Hr, Section, Link } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const APP_URL = 'https://outreign.io'
const SUPPORT_EMAIL = 'support@bdotindustries.com'

interface Issue {
  /** blacklist | reputation_drop | auth_failure */
  type: string
  domain?: string | null
  message: string
}

interface Props {
  name?: string
  issues?: Issue[]
}

// What the user should actually do, per issue type. A deliverability alert
// that only reports a state leaves the reader to guess at the remedy, and the
// remedies here are not obvious — "you are on Spamhaus" tells you nothing about
// delisting being free and self-service.
const NEXT_STEP: Record<string, string> = {
  blacklist:
    'Stop sending from this domain now. Request delisting directly with the blacklist — it is free and usually self-service. Sending while listed deepens the problem.',
  reputation_drop:
    'Sending from this mailbox is already paused automatically. Before resuming, cut daily volume and tighten targeting — the score fell because recipients were not engaging.',
  auth_failure:
    'Fix the DNS records for this domain. Until SPF, DKIM and DMARC all pass, a growing share of your mail is filtered before anyone sees it.',
}

const TITLE: Record<string, string> = {
  blacklist: 'Domain blacklisted',
  reputation_drop: 'Sender reputation dropped',
  auth_failure: 'Email authentication failing',
}

const Email = ({ name, issues = [] }: Props) => {
  const many = issues.length > 1
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {many
          ? `${issues.length} deliverability problems need your attention`
          : (issues[0] ? TITLE[issues[0].type] ?? 'Deliverability problem' : 'Deliverability problem')}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            {name ? `${name}, your outbound needs attention` : 'Your outbound needs attention'}
          </Heading>
          <Text style={text}>
            {many
              ? `We found ${issues.length} problems that stop your emails reaching inboxes. Each one is costing you replies right now.`
              : 'We found a problem that stops your emails reaching inboxes. It is costing you replies right now.'}
          </Text>

          {issues.map((issue, i) => (
            <Section key={i} style={box}>
              <Text style={boxTitle}>
                {TITLE[issue.type] ?? 'Deliverability problem'}
                {issue.domain ? ` — ${issue.domain}` : ''}
              </Text>
              <Text style={boxItem}>{issue.message}</Text>
              <Text style={boxAction}>{NEXT_STEP[issue.type] ?? 'Open the deliverability dashboard for details.'}</Text>
            </Section>
          ))}

          <Section style={ctaSection}>
            <Button href={`${APP_URL}/dashboard/deliverability`} style={button}>
              Open deliverability
            </Button>
          </Section>

          <Text style={textSmall}>
            You are getting this because it is serious enough to stop sending over. We do not email
            about routine warnings, and we will not email you about this one again unless it clears
            and comes back.
          </Text>

          <Hr style={hr} />
          <Text style={sig}>
            — The OutReign team<br />
            <Link href={`mailto:${SUPPORT_EMAIL}`} style={link}>{SUPPORT_EMAIL}</Link>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template: TemplateEntry = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const issues: Issue[] = Array.isArray(data?.issues) ? data.issues : []
    if (issues.length > 1) return `${issues.length} deliverability problems on your sending domains`
    const one = issues[0]
    if (!one) return 'Deliverability problem on your account'
    const label = TITLE[one.type] ?? 'Deliverability problem'
    return one.domain ? `${label} — ${one.domain}` : label
  },
  displayName: 'Deliverability alert',
  previewData: {
    name: 'Brandon',
    issues: [
      {
        type: 'blacklist',
        domain: 'outreach.example.com',
        message: 'outreach.example.com is listed on Spamhaus DBL.',
      },
      {
        type: 'auth_failure',
        domain: 'mail.example.com',
        message: 'SPF, DKIM failing on mail.example.com.',
      },
    ],
  },
}

const main = { backgroundColor: '#f9fafb', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }
const container = { backgroundColor: '#ffffff', margin: '0 auto', padding: '32px 28px', maxWidth: '560px', borderRadius: '10px' }
const h1 = { fontSize: '22px', fontWeight: '700' as const, color: '#111827', margin: '0 0 16px' }
const text = { fontSize: '15px', color: '#374151', lineHeight: '1.6', margin: '0 0 16px' }
const textSmall = { fontSize: '13px', color: '#6b7280', lineHeight: '1.6', margin: '20px 0 0' }
const box = { backgroundColor: '#fef2f2', borderLeft: '3px solid #dc2626', borderRadius: '4px', padding: '16px 20px', margin: '16px 0' }
const boxTitle = { fontSize: '14px', fontWeight: '700' as const, color: '#991b1b', margin: '0 0 8px' }
const boxItem = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0 0 10px' }
const boxAction = { fontSize: '14px', color: '#111827', lineHeight: '1.6', margin: '0', fontWeight: '600' as const }
const ctaSection = { textAlign: 'center' as const, margin: '28px 0 20px' }
const button = { backgroundColor: '#7c3aed', color: '#ffffff', padding: '12px 22px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', fontWeight: '600' as const }
const link = { color: '#7c3aed', textDecoration: 'underline', fontWeight: '600' as const }
const hr = { borderColor: '#e5e7eb', margin: '32px 0 24px' }
const sig = { fontSize: '14px', color: '#374151', lineHeight: '1.6', margin: '0' }
