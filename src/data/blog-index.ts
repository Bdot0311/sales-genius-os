// AUTO-SPLIT from the former single blog-posts.ts module.
// Metadata only — importing this keeps the ~110 KB of article bodies
// (src/data/blog-content.ts) out of any bundle that just lists posts
// (homepage footer, /blog index). Article bodies are loaded on demand.
export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  readingTime: string;
  category: string;
  keywords: string[];
}

export const blogPostsMeta: BlogPostMeta[] = [
  {
    "slug": "b2b-lead-scoring-models-startups",
    "title": "B2B Lead Scoring Models for Startups: From ICP to a Prioritized List",
    "description": "A practical lead scoring framework for early-stage B2B startups: how to turn a broad ICP into a ranked call list using fit and intent signals, with point weights, thresholds, and a recalibration loop.",
    "publishedAt": "2026-07-31",
    "readingTime": "11 min read",
    "category": "Lead Scoring",
    "keywords": [
      "b2b lead scoring models startups",
      "lead scoring framework",
      "fit and intent scoring",
      "lead prioritization outbound",
      "lead scoring model example",
      "startup lead qualification",
      "sales qualification framework"
    ]
  },
  {
    "slug": "cold-email-infrastructure-guide",
    "title": "Cold Email Infrastructure: Multiple Domains and Inboxes (2026 Guide)",
    "description": "How to build cold email outreach infrastructure across multiple domains and inboxes: secondary domains, SPF/DKIM/DMARC setup, warm-up schedules, and mailbox rotation that protects deliverability.",
    "publishedAt": "2026-07-31",
    "readingTime": "10 min read",
    "category": "Deliverability",
    "keywords": [
      "cold email outreach infrastructure multiple domains inboxes",
      "cold email infrastructure",
      "cold email domains setup",
      "spf dkim dmarc cold email",
      "mailbox rotation cold email",
      "email warm up schedule",
      "cold email deliverability",
      "secondary sending domains"
    ]
  },
  {
    "slug": "outreign-vs-rocketreach",
    "title": "After RocketReach: Turning a Contact List Into Sent Outreach",
    "description": "RocketReach hands you contact data. Then the real work starts: deciding who is worth emailing, verifying deliverability, and writing the message. Here is the workflow that turns a contact list into sent outreach.",
    "publishedAt": "2026-07-18",
    "readingTime": "6 min read",
    "category": "Comparisons",
    "keywords": [
      "contact data to outreach",
      "what to do after rocketreach",
      "turn a contact list into outreach",
      "outreach tool with ICP scoring",
      "AI drafted outreach",
      "prospect qualification workflow"
    ]
  },
  {
    "slug": "outreign-vs-instantly",
    "title": "You Have a Cold Email Sender. You Still Need Someone to Email.",
    "description": "A cold email sender like Instantly maximizes delivery, but it does not decide who is worth emailing. Here is how prospect discovery and ICP scoring feed a sending engine so volume lands on the right people.",
    "publishedAt": "2026-07-17",
    "readingTime": "6 min read",
    "category": "Comparisons",
    "keywords": [
      "lead source for cold email",
      "finding leads for cold email",
      "cold email tool with lead discovery",
      "prospect discovery vs sending volume",
      "who to email cold outreach"
    ]
  },
  {
    "slug": "how-to-find-b2b-leads-without-boolean-search",
    "title": "How to Find B2B Leads Without Boolean Search",
    "description": "You don't need to learn boolean syntax to build a qualified B2B lead list. Here's a faster method for founders and small SDR teams.",
    "publishedAt": "2026-05-12",
    "readingTime": "4 min read",
    "category": "Lead Generation",
    "keywords": [
      "find B2B leads",
      "B2B lead generation",
      "lead discovery",
      "outbound prospecting",
      "no boolean search"
    ]
  },
  {
    "slug": "what-is-icp-scoring",
    "title": "What Is ICP Scoring in Sales? (And Why It Replaces Manual Qualification)",
    "description": "ICP scoring assigns a fit percentage to each prospect based on how closely they match your Ideal Customer Profile. Here's how it works and why it matters for outbound sales.",
    "publishedAt": "2026-05-12",
    "readingTime": "4 min read",
    "category": "Sales Strategy",
    "keywords": [
      "ICP scoring",
      "ideal customer profile",
      "outbound sales",
      "prospect qualification"
    ]
  },
  {
    "slug": "apollo-alternative-for-founders",
    "title": "Founder-Led Outbound: Why Apollo Fights You (and What to Do Instead)",
    "description": "Doing your own outbound as a founder? Apollo is built for SDR teams with ops support. Here's why it slows solo founders down and the simpler setup that fits.",
    "publishedAt": "2026-05-12",
    "readingTime": "5 min read",
    "category": "Comparisons",
    "keywords": [
      "founder-led outbound",
      "doing your own outbound",
      "outbound sales for founders",
      "outbound sales software for startups",
      "B2B prospecting for founders"
    ]
  },
  {
    "slug": "apollo-vs-instantly-vs-salesloft",
    "title": "Apollo vs Instantly vs Salesloft: Which Outbound Tool Should You Actually Use?",
    "description": "A no-fluff comparison of Apollo, Instantly, Salesloft, and Outreach for founders and small sales teams — with the cheaper, faster alternative most teams actually need.",
    "publishedAt": "2026-05-14",
    "readingTime": "6 min read",
    "category": "Tool Comparisons",
    "keywords": [
      "apollo alternative",
      "instantly alternative",
      "salesloft alternative",
      "outreach alternative",
      "apollo vs instantly",
      "apollo vs salesloft",
      "instantly vs salesloft",
      "best outbound sales tool"
    ]
  },
  {
    "slug": "best-b2b-lead-generation-tools",
    "title": "Best B2B Lead Generation Tools 2026: OutReign vs Apollo vs Instantly",
    "description": "A deep-dive comparison of OutReign, Apollo, and Instantly. How to pick a consolidated outbound stack instead of stitching three tools together.",
    "publishedAt": "2026-06-08",
    "readingTime": "7 min read",
    "category": "Comparisons",
    "keywords": [
      "best b2b lead generation tools",
      "apollo alternative",
      "instantly alternative",
      "outreign vs apollo",
      "outreign vs instantly",
      "consolidated outbound stack"
    ]
  },
  {
    "slug": "email-closing-lines",
    "title": "Professional Email Closing Lines for B2B Outbound Sales",
    "description": "How to end a B2B sales email so it actually gets a reply. Tactical closing lines and templates for cold opens, follow-ups, and meeting requests.",
    "publishedAt": "2026-06-08",
    "readingTime": "7 min read",
    "category": "Outbound Sales",
    "keywords": [
      "how to end an email",
      "email closing lines",
      "email closing lines for sales",
      "email sign offs",
      "B2B email closing",
      "sales email CTA",
      "cold email closing line"
    ]
  },
  {
    "slug": "b2b-prospecting-guide",
    "title": "B2B Prospecting in 2026: A Practical Guide for Lean Teams",
    "description": "Modern B2B prospecting for founders and small sales teams: ICP scoring, signal-based targeting, verified emails, and AI-drafted outreach without the manual grind.",
    "publishedAt": "2026-06-12",
    "readingTime": "9 min read",
    "category": "Lead Generation",
    "keywords": [
      "B2B prospecting",
      "how to generate B2B leads",
      "B2B prospecting strategies",
      "ICP scoring",
      "AI outreach",
      "lean sales teams"
    ]
  },
  {
    "slug": "partnership-email-templates",
    "title": "12 Partnership Email Templates That Actually Get Replies",
    "description": "Proven partnership outreach templates for co-marketing, integrations, affiliate, reseller, and content collaborations — plus the structure that makes them convert.",
    "publishedAt": "2026-06-12",
    "readingTime": "10 min read",
    "category": "Outbound",
    "keywords": [
      "partnership email templates",
      "partnership outreach email",
      "collaboration email template",
      "co-marketing email",
      "integration partnership email",
      "affiliate outreach email",
      "business partnership proposal email"
    ]
  },
  {
    "slug": "icp-criteria-revenue-operations",
    "title": "ICP Criteria for Revenue Operations: The Complete 2026 Guide",
    "description": "How B2B revenue operations teams define, score, and refresh an Ideal Customer Profile — firmographic filters, intent signals, and a normalized scoring framework.",
    "publishedAt": "2026-07-09",
    "readingTime": "8 min read",
    "category": "Revenue Operations",
    "keywords": [
      "icp criteria for revenue operations",
      "ideal customer profile",
      "revenue operations",
      "icp scoring",
      "b2b lead scoring",
      "firmographic scoring",
      "intent-based scoring",
      "revops icp"
    ]
  },
  {
    "slug": "email-warmup",
    "title": "Email Warmup: The Complete 2026 Guide for Cold Outreach",
    "description": "Step-by-step email warmup: SPF, DKIM, DMARC setup, a 4-week ramp schedule, and the deliverability signals that decide whether your cold emails land in inbox or spam.",
    "publishedAt": "2026-06-13",
    "readingTime": "9 min read",
    "category": "Deliverability",
    "keywords": [
      "email warmup",
      "email warm up",
      "cold email warmup",
      "smtp warmup",
      "domain warmup",
      "spf dkim dmarc",
      "sender reputation",
      "cold email deliverability"
    ]
  },
  {
    "slug": "b2b-icp-criteria-template",
    "title": "B2B ICP Criteria & Template: A RevOps Guide to the Ideal Customer Profile",
    "description": "The complete guide to defining a B2B Ideal Customer Profile. ICP criteria for revenue operations, tiering, scoring, buying triggers, and a copy-paste template.",
    "publishedAt": "2026-07-10",
    "readingTime": "12 min read",
    "category": "ICP & Targeting",
    "keywords": [
      "icp criteria for revenue operations",
      "b2b icp template",
      "ideal customer profile b2b",
      "icp criteria",
      "revenue operations icp",
      "b2b ideal customer profile template",
      "sales ideal customer profile"
    ]
  },
  {
    "slug": "b2b-buying-intent-signals",
    "title": "B2B Buying Intent Signals: How to Spot Who's Ready to Buy Before They Raise Their Hand",
    "description": "Technographic, hiring, funding, and news-based intent signals explained — plus how to automate discovery with an AI SDR so you reach prospects at the exact moment they're ready to buy.",
    "publishedAt": "2026-07-15",
    "readingTime": "7 min read",
    "category": "Sales Strategy",
    "keywords": [
      "b2b buying intent signals",
      "how to track sales intent",
      "intent signals in b2b sales",
      "sales intent data",
      "AI SDR intent signals",
      "buying intent signals examples"
    ]
  }
];
