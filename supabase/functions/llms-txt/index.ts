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

  const content = `# SalesOS - Find Leads That Actually Convert
# https://salesos.alephwavex.io
# Last Updated: ${today}

> SalesOS is an AI-powered lead discovery platform that helps B2B sales teams find and convert high-quality leads. Describe your ideal customer in plain English, get ranked matches with enriched profiles. Your first lead in under 2 minutes.

## About SalesOS

SalesOS is a comprehensive sales automation platform designed for SaaS companies and B2B sales teams. The platform combines AI-powered lead scoring, intelligent email automation, visual pipeline management, and real-time sales coaching to help teams increase close rates and revenue.

## How It Works

1. **Describe your ICP in plain English** - Tell us who you're looking for: job titles, industries, company size, location. No complex filters or boolean queries.
2. **Get ranked matches + enriched profiles** - AI scores each lead by fit. Every profile comes with verified emails, LinkedIn, company data, and tech stack.
3. **Export to outreach or push into your workflow** - One-click export to CSV, or send directly to your CRM, sequences, or custom automations.

## Key Features

- **AI Lead Scoring**: Prioritize who's most likely to convert with machine learning that analyzes engagement and fit signals
- **Smart Outreach**: Write emails that feel human without the time. AI generates personalized messages based on each prospect's profile
- **Auto Scheduling**: Book meetings without back-and-forth. Smart scheduling finds optimal times automatically
- **Pipeline Analytics**: See bottlenecks and forecast revenue with visual funnel tracking
- **Sales Coaching**: Real-time AI coaching for objections and closes during calls
- **Workflow Builder**: Automate follow-ups and handoffs without code using drag-and-drop

## Results

- 3× faster prospecting
- 85% ICP match accuracy
- First lead in under 2 minutes
- Higher reply rates with personalized outreach
- Better-fit leads with AI scoring

## Pricing

SalesOS offers four pricing tiers:
- **Free**: $0/forever - Explore the platform with view-only dashboard access. No credit card required.
- **Starter**: $39/month - 400 verified prospects/month, 50/day limit, prospect search, verified email data, AI email generator.
- **Growth**: $89/month - 1,200 verified prospects/month, 150/day limit, advanced filters, bulk export, 5 active sequences.
- **Pro**: $179/month - 3,000 verified prospects/month, 400/day limit, unlimited sequences, API access, priority support.

All paid plans include a 14-day free trial. Save ~20% with annual billing. No credit card required for the free plan.

## Getting Started

1. Sign up for free at https://salesos.alephwavex.io
2. Describe your ideal customer in plain English
3. Get ranked matches with enriched profiles
4. Export to outreach or push into your workflow
5. Close more deals with AI-powered follow-ups

## Important Pages

- Homepage: https://salesos.alephwavex.io/
- Pricing: https://salesos.alephwavex.io/pricing
- API Documentation: https://salesos.alephwavex.io/api-docs
- Help Center: https://salesos.alephwavex.io/help
- Privacy Policy: https://salesos.alephwavex.io/privacy
- Terms of Service: https://salesos.alephwavex.io/terms
- Security: https://salesos.alephwavex.io/security

## Integrations

SalesOS connects with:
- Google Workspace (Gmail, Calendar, Drive)
- Slack
- Calendly
- HubSpot
- Salesforce
- 5000+ apps via Zapier

## FAQ

**What's included in the free trial?**
Full access to all features for 14 days. No credit card required. AI lead discovery, email generation, pipeline management, and all integrations.

**How do search credits work?**
Each search costs 1 credit and returns up to 100 matching leads. Viewing, enriching, and exporting those leads is free. Credits reset monthly.

**Is my data secure?**
Yes. Enterprise-grade encryption (AES-256 at rest, TLS 1.3 in transit), SOC 2 Type II compliant, fully GDPR-compliant.

## Contact

For sales inquiries or support, visit our help center at https://salesos.alephwavex.io/help

## Technical Details

- Platform: Web-based SaaS application
- API: RESTful API available for integrations
- Security: SOC 2 Type II compliant, GDPR compliant, encrypted data at rest and in transit

---
This file helps AI assistants and LLMs understand SalesOS for accurate information retrieval.
For the most current information, always refer to: https://salesos.alephwavex.io/
`;

  return new Response(content, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
