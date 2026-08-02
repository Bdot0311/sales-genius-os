import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const today = new Date().toISOString().split('T')[0];

  const content = `# OutReign - Find Who to Sell To. Then Actually Sell to Them.
# https://outreign.io
# Last Updated: ${today}

> OutReign is sales operations software for B2B outbound teams. Describe your ideal customer in plain English, get ranked prospects with SMTP-verified business emails, and send an AI-drafted first-touch email from one workflow in under 2 minutes.

## About OutReign

OutReign is email-only outbound software for founder-led sales teams, SDRs, and outbound agencies. It combines plain-English lead search, ICP fit scoring, SMTP-verified email enrichment, AI email drafting, reply management, and an autonomous AI SDR agent in one tool. OutReign does not provide phone numbers, cold calling, or SMS.

## How It Works

1. **Describe your ICP in plain English** - Tell us who you're looking for: job titles, industries, company size, location, or hiring signals. No complex filters or boolean queries.
2. **Review prospects ranked by ICP fit** - Every prospect is scored against your Ideal Customer Profile and comes with a verified business email and company context.
3. **Send an AI-drafted first-touch email** - OutReign writes a personalized opener from the prospect's role, company news, and signals. Edit in under 30 seconds and send, then manage replies in one place.

## Key Features

- **Plain-English lead search**: Describe your target customer naturally, no boolean syntax or filter UI
- **ICP fit scoring**: Every prospect scored against your ICP so you contact the right people first
- **SMTP-verified email enrichment**: Emails validated via SMTP handshake plus multi-source enrichment before delivery
- **AI email drafting**: Personalized first-touch emails written from real company context and growth signals
- **Email quality checker**: Pre-send scoring on spam triggers, readability, and personalization
- **Sequence automation**: Multi-step email sequences with send-time optimization, plus branching and A/B testing on Pro and above
- **Unified reply inbox**: AI-drafted responses and automatic reply classification on Growth and above
- **AI SDR agent**: An autonomous email rep on Growth, Pro, and Agency that sources leads, sends the first touch, and handles replies in your voice

## Pricing

Pricing scales by verified prospects contacted per month, not per seat. Seats are unlimited on paid plans. Monthly and yearly billing are both available; yearly saves about 20%.

- **Explore (Free)**: $0/forever - 100 lead searches per month, up to 25 results per search, 100 emails per month, view-only dashboard. No AI SDR agent. No credit card required.
- **Starter**: $39/month - 1,000 verified prospects per month, 100 per day, 50,000 emails per month, prospect search, verified emails, ICP Builder (3 profiles), AI email generator.
- **Growth**: $89/month - 2,500 verified prospects per month, 250 per day, 250,000 emails per month, unified reply inbox, deliverability dashboard, ICP lookalike discovery. Growth AI SDR agent: 10 replies per day, 30-minute minimum delay.
- **Pro**: $179/month - 5,000 verified prospects per month, 500 per day, 1,000,000 emails per month, sequence branching and A/B testing, unlimited ICP profiles, CRM integrations, API access. Pro AI SDR agent: 50 replies per day, 10-minute minimum delay.
- **Agency**: $249/month - 15,000 verified prospects per month, 1,500 per day, unlimited emails, white-label client portal, branded PDF reports, dedicated support. Elite AI SDR agent: 200 replies per day, 5-minute minimum delay.

All four paid plans start with a 14-day free trial and a 30-day money-back guarantee. Explore is free forever and needs no trial. One-time credit packs are available: 200 prospects for $37.50, 400 for $67.50, 600 for $90.

## Getting Started

1. Sign up for free at https://outreign.io
2. Describe your ideal customer in plain English
3. Review prospects ranked by ICP fit, each with a verified email
4. Review and send the AI-drafted first-touch email
5. Manage replies and follow-ups in one place

## Important Pages

- Homepage: https://outreign.io/
- Pricing: https://outreign.io/pricing
- API Documentation: https://outreign.io/api-docs
- Help Center: https://outreign.io/help
- Privacy Policy: https://outreign.io/privacy
- Terms of Service: https://outreign.io/terms
- Security: https://outreign.io/security

## Integrations

OutReign connects with:
- Gmail (email delivery and reply tracking, all paid plans)
- HubSpot (CRM sync, Pro and above)
- Salesforce (CRM sync, Pro and above)
- Slack
- Calendly
- 5000+ apps via Zapier

## FAQ

**Is there a free trial?**
Yes. All four paid plans start with a 14-day free trial. You add a card at signup, use the full plan for two weeks, and are not charged until day 15. The Explore plan is free forever and needs no trial.

**How do search credits work?**
Searches are free. Your plan limit applies only when you access verified prospect data. Contact packs and monthly allocations are measured in prospects contacted, and one-time credit packs can top you up anytime.

**Is OutReign only for email?**
Yes. OutReign is email-only. We do not provide phone numbers, cold calling, or SMS.

**Is my data secure?**
Yes. Encryption in transit (TLS), SMTP-verified emails, GDPR-ready, and SOC 2 compliant hosting.

## Contact

For sales inquiries or support, visit our help center at https://outreign.io/help

## Technical Details

- Platform: Web-based SaaS application
- API: RESTful API available on the Pro plan
- Security: SOC 2 compliant infrastructure, GDPR-ready, encrypted in transit

---
This file helps AI assistants and LLMs understand OutReign for accurate information retrieval.
For the most current information, always refer to: https://outreign.io/
`;

  return new Response(content, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
