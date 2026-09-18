/**
 * The tools people are searching to replace, and what OutReign offers instead.
 *
 * "{tool} alternative" is the highest-intent query in this category: the person
 * typing it has already decided to leave and is choosing where to go. That is
 * the traffic worth having, and it is also the traffic most easily lost by
 * getting a fact wrong about someone else's product.
 *
 * So the rule here is strict, and it is why this file reads the way it does:
 *
 *   Everything asserted about OutReign is verifiable from this repository.
 *   Nothing is asserted about a competitor beyond its product category.
 *
 * `category` is a single publicly obvious sentence — what kind of tool it is,
 * the sort of thing its own homepage says. There are no competitor prices, no
 * limits, no feature counts and no claims about quality anywhere in this file,
 * because those change without notice and a page that is wrong about a rival is
 * worse than no page at all.
 *
 * `reasons` are written as what the switcher is looking FOR, not as accusations
 * about what they are leaving. That is both the honest framing and the better
 * one: positive positioning converts, and a page that opens by attacking
 * somebody else reads as insecure.
 *
 * Sharpening any of this — naming a rival's pricing model, a limit, a
 * shortcoming — needs a human who has checked it that week. Do not let a model
 * fill it in.
 */
export interface Competitor {
  /** URL slug: /alternatives/{slug} */
  slug: string;
  /** The tool's name as people type it. */
  name: string;
  /** One publicly obvious sentence about what kind of product it is. */
  category: string;
  /** The search intent this page answers, used in the meta description. */
  intent: string;
  /** What the switcher is looking for, and what OutReign does about it. */
  reasons: { looking: string; outreign: string }[];
  /** Questions a person comparing the two actually asks. */
  faqs: { question: string; answer: string }[];
  /** An existing page worth sending this reader to next. */
  related: { href: string; label: string }[];
}

/**
 * Deliberately no entry for a tool that already has a /vs- page.
 *
 * /vs-apollo, /vs-instantly, /vs-lusha, /vs-zoominfo and /vs-rocketreach exist,
 * and /apollo-alternative covers that one intent directly. Adding
 * /alternatives/instantly beside /vs-instantly would put two pages of ours in
 * front of the same searcher, splitting the authority between them rather than
 * ranking either. These are the tools with no page at all.
 */
export const COMPETITORS: Competitor[] = [
  {
    slug: "lemlist",
    name: "lemlist",
    category: "a cold email sequencing tool with personalisation features",
    intent: "Looking for a lemlist alternative that finds the prospects as well as emailing them",
    reasons: [
      {
        looking: "One tool instead of a stack",
        outreign:
          "Finding prospects, scoring them against your ICP, writing the email and handling the reply all happen in OutReign. There is no separate data vendor to buy first and no export step between the list and the send.",
      },
      {
        looking: "Prospects, not just sending",
        outreign:
          "Describe who you want in plain English and get ranked, SMTP-verified contacts back. You are not bringing your own list.",
      },
      {
        looking: "Personalisation that is not a mail merge",
        outreign:
          "Every email is drafted from what the agent actually found about that company, then scored against a reply rubric before it is allowed to send.",
      },
      {
        looking: "Pricing that starts where a small team starts",
        outreign:
          "Explore is free with 100 searches a month. Starter is $39/mo for up to 1,000 verified prospects, and there is no per-seat charge.",
      },
    ],
    faqs: [
      {
        question: "Does OutReign replace lemlist entirely?",
        answer:
          "For finding prospects, writing and sending sequences, and managing replies, yes — those are all built in. If your workflow depends on a lemlist-specific integration, check the Integrations page first.",
      },
      {
        question: "Do I need to bring my own lead list?",
        answer:
          "No. Describing your ICP in plain English returns ranked, verified prospects, which is the step most sending tools leave to you.",
      },
      {
        question: "What does it cost to try?",
        answer:
          "Explore is free and includes 100 lead searches a month with no card. Paid plans start at $39/mo.",
      },
    ],
    related: [
      { href: "/cold-email-software", label: "How OutReign handles cold email end to end" },
      { href: "/vs-instantly", label: "OutReign compared with Instantly" },
    ],
  },
  {
    slug: "smartlead",
    name: "Smartlead",
    category: "a cold email sending and inbox rotation platform",
    intent: "Looking for a Smartlead alternative that sources and scores the leads too",
    reasons: [
      {
        looking: "The list and the sending in one place",
        outreign:
          "Sending tools assume the list already exists. OutReign finds the people, verifies the addresses before they are used, and sends — so a bounce is caught before it costs you a domain.",
      },
      {
        looking: "Deliverability you can see",
        outreign:
          "Domain health, placement tests and per-mailbox sending limits are part of the product, with alerts when reputation moves.",
      },
      {
        looking: "Copy that earns a reply",
        outreign:
          "Every agent-written email has to reach 100/100 on a reply rubric before it goes out. Anything short of that is discarded, not sent.",
      },
      {
        looking: "A free way to see if it works",
        outreign:
          "Explore is free with 100 searches a month, so you can test the lead quality before paying for sending volume.",
      },
    ],
    faqs: [
      {
        question: "Does OutReign do inbox rotation?",
        answer:
          "OutReign sends from your connected mailboxes with per-mailbox daily limits and warmup, and reports domain health. Check the Deliverability page for exactly what is covered before switching.",
      },
      {
        question: "Can I keep my existing domains?",
        answer:
          "Yes — you connect the mailboxes you already send from. Warmup and placement testing run against those.",
      },
      {
        question: "What is included for free?",
        answer: "100 lead searches a month on Explore, with no card.",
      },
    ],
    related: [
      { href: "/cold-email-software", label: "How OutReign handles cold email end to end" },
      { href: "/blog/cold-email-infrastructure-guide", label: "Cold email infrastructure, explained" },
    ],
  },
  {
    slug: "hunter",
    name: "Hunter",
    category: "an email finding and verification tool",
    intent: "Looking for a Hunter alternative that goes past finding the address",
    reasons: [
      {
        looking: "Who to email, not just their address",
        outreign:
          "An address is the last step. OutReign starts from a description of your ideal customer and returns ranked people who match it, with the address attached.",
      },
      {
        looking: "Verification before the send, not after",
        outreign:
          "Addresses are SMTP-verified server-side and undeliverable ones are dropped before they reach you, so they never enter a sequence.",
      },
      {
        looking: "Something that writes and sends",
        outreign:
          "Drafting, sending, follow-ups and reply handling are built in, so there is nothing to export.",
      },
      {
        looking: "A free tier that is actually usable",
        outreign: "100 lead searches a month on Explore, no card.",
      },
    ],
    faqs: [
      {
        question: "Is OutReign an email finder?",
        answer:
          "It includes one, but that is not the product. The product is finding the right people, scoring them against your ICP, and running the outbound — the address is one field on the record.",
      },
      {
        question: "Are the emails verified?",
        answer:
          "Yes, server-side before delivery. Addresses proven undeliverable are removed rather than handed to you with a warning.",
      },
      {
        question: "Can I export the contacts?",
        answer: "Bulk export is available from the Growth plan up.",
      },
    ],
    related: [
      { href: "/blog/how-to-find-b2b-leads-without-boolean-search", label: "Finding leads without boolean search" },
      { href: "/vs-lusha", label: "OutReign compared with Lusha" },
    ],
  },
  {
    slug: "clay",
    name: "Clay",
    category: "a data enrichment and GTM automation workspace",
    intent: "Looking for a Clay alternative that works without building the workflow yourself",
    reasons: [
      {
        looking: "An answer, not a canvas",
        outreign:
          "There is no table to wire up and no enrichment waterfall to design. You describe the customer you want in a sentence and get scored, verified people back.",
      },
      {
        looking: "Outbound included",
        outreign:
          "Sending, follow-ups, deliverability and replies are part of the product rather than the thing you pipe the output into.",
      },
      {
        looking: "Predictable cost",
        outreign:
          "Plans are a flat monthly price with a stated number of verified prospects — $39, $89, $179 or $249 a month — not a credit balance you watch drain per enrichment.",
      },
      {
        looking: "Something a non-technical founder can run",
        outreign:
          "The whole search is a sentence in plain English. Nothing about it assumes you have used a spreadsheet automation tool before.",
      },
    ],
    faqs: [
      {
        question: "Is OutReign as flexible as Clay?",
        answer:
          "No, and deliberately. Clay is a workspace you build in. OutReign is opinionated: it decides who is worth contacting, writes the email and sends it. If your value comes from custom enrichment logic, that is a real reason to stay.",
      },
      {
        question: "Can I still export to my CRM?",
        answer: "Yes — bulk export is available from Growth up, and there is an API.",
      },
      {
        question: "What does it cost?",
        answer:
          "Explore is free with 100 searches a month. Paid plans are $39, $89, $179 and $249 a month.",
      },
    ],
    related: [
      { href: "/blog/what-is-icp-scoring", label: "What ICP scoring actually measures" },
      { href: "/sales-operations-software", label: "OutReign for sales operations" },
    ],
  },
  {
    slug: "salesloft",
    name: "Salesloft",
    category: "a sales engagement platform built for larger sales teams",
    intent: "Looking for a Salesloft alternative sized for a small team",
    reasons: [
      {
        looking: "Something a team of one to five can run",
        outreign:
          "No per-seat pricing, no implementation project and no assumption that an SDR team and a RevOps owner already exist.",
      },
      {
        looking: "The prospects included",
        outreign:
          "Engagement platforms sequence a list you bring. OutReign finds the list, scores it against your ICP and then sequences it.",
      },
      {
        looking: "An agent that does the work",
        outreign:
          "The AI agent researches each company, drafts the email, scores it against a reply rubric and only sends at 100/100.",
      },
      {
        looking: "To start this week",
        outreign: "Explore is free, and the first search takes a sentence.",
      },
    ],
    faqs: [
      {
        question: "Is OutReign an enterprise platform?",
        answer:
          "No. It is built for founders and small teams doing their own outbound. If you need enterprise CRM governance and forecasting, an engagement platform is the right category.",
      },
      {
        question: "Does it connect to a CRM?",
        answer: "There is an API and bulk export. Check the Integrations page for what is supported today.",
      },
      {
        question: "How is it priced?",
        answer:
          "Flat monthly plans from $39, by number of verified prospects rather than by seat.",
      },
    ],
    related: [
      { href: "/ai-sdr-agent", label: "What the AI SDR agent does" },
      { href: "/sales-operations-software", label: "OutReign for sales operations" },
    ],
  },
  {
    slug: "mailshake",
    name: "Mailshake",
    category: "a cold email outreach and sequencing tool",
    intent: "Looking for a Mailshake alternative that brings the prospects with it",
    reasons: [
      {
        looking: "Not having to buy a list first",
        outreign:
          "The search and the sending are the same product. Describe your ICP, get verified people, send — with nothing bought or exported in between.",
      },
      {
        looking: "Emails written from something real",
        outreign:
          "The agent researches the company before it writes, and the draft is scored against a reply rubric before it is allowed out.",
      },
      {
        looking: "Deliverability taken seriously",
        outreign:
          "Warmup, placement testing, per-mailbox limits and domain health alerts are built in rather than bolted on.",
      },
      {
        looking: "A free way to judge the data",
        outreign: "100 lead searches a month on Explore, no card.",
      },
    ],
    faqs: [
      {
        question: "Can I import my existing sequences?",
        answer:
          "Sequences are rebuilt in OutReign rather than imported. Most people use the move as a chance to rewrite, since the agent drafts from company research rather than from a template.",
      },
      {
        question: "Does it send from my own domain?",
        answer: "Yes, from the mailboxes you connect, with warmup and per-mailbox daily limits.",
      },
      {
        question: "What is the cheapest paid plan?",
        answer: "$39/mo for up to 1,000 verified prospects.",
      },
    ],
    related: [
      { href: "/cold-email-software", label: "How OutReign handles cold email end to end" },
      { href: "/blog/email-warmup", label: "Email warmup, explained" },
    ],
  },
  {
    slug: "woodpecker",
    name: "Woodpecker",
    category: "a cold email sending tool aimed at agencies and small teams",
    intent: "Looking for a Woodpecker alternative that sources prospects as well as sending",
    reasons: [
      {
        looking: "Lead sourcing included",
        outreign:
          "A sending tool needs a list. OutReign produces the list — ranked by ICP fit, with addresses verified before use.",
      },
      {
        looking: "Client work that reports itself",
        outreign:
          "The Agency plan covers up to 15,000 verified prospects a month with client portals and white labelling.",
      },
      {
        looking: "Copy that is not a template",
        outreign:
          "Each email is written from what the agent found about that specific company and scored before sending.",
      },
      {
        looking: "To try it before committing",
        outreign: "Explore is free with 100 searches a month.",
      },
    ],
    faqs: [
      {
        question: "Does OutReign work for an agency running several clients?",
        answer:
          "That is what the Agency plan is for — 15,000 verified prospects a month, client portals, white labelling and per-client reporting.",
      },
      {
        question: "Can each client have their own ICP?",
        answer: "Yes. ICP profiles are unlimited from the Pro plan up.",
      },
      {
        question: "What does the Agency plan cost?",
        answer: "$249/mo.",
      },
    ],
    related: [
      { href: "/partners", label: "OutReign for agencies and partners" },
      { href: "/cold-email-software", label: "How OutReign handles cold email end to end" },
    ],
  },
  {
    slug: "snov-io",
    name: "Snov.io",
    category: "an email finder and cold email sending toolkit",
    intent: "Looking for a Snov.io alternative with ICP scoring built in",
    reasons: [
      {
        looking: "Ranking, not just a list",
        outreign:
          "Every prospect arrives scored against your ICP, so the order you work them in is decided before you open the list.",
      },
      {
        looking: "One product rather than a toolkit",
        outreign:
          "Search, verification, drafting, sending, deliverability and replies are one workflow, not separate tools that hand off to each other.",
      },
      {
        looking: "Verification that removes the bad addresses",
        outreign:
          "Undeliverable addresses are dropped server-side before they reach your list rather than flagged for you to filter.",
      },
      {
        looking: "A free tier to test data quality",
        outreign: "100 lead searches a month on Explore, no card.",
      },
    ],
    faqs: [
      {
        question: "Does OutReign have a Chrome extension?",
        answer:
          "No. The search is a sentence describing your ICP rather than a profile you are looking at, so there is nothing to scrape from a page.",
      },
      {
        question: "How does ICP scoring work?",
        answer:
          "You define what a good customer looks like once, and every prospect returned is scored against it before you see them.",
      },
      {
        question: "What does it cost?",
        answer: "Free to start. Paid plans are $39, $89, $179 and $249 a month.",
      },
    ],
    related: [
      { href: "/blog/what-is-icp-scoring", label: "What ICP scoring actually measures" },
      { href: "/vs-rocketreach", label: "OutReign compared with RocketReach" },
    ],
  },
];

export const competitorBySlug = (slug: string): Competitor | undefined =>
  COMPETITORS.find((c) => c.slug === slug);
