import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import { motion } from "motion/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Target,
  ShieldCheck,
  Mail,
  Repeat,
  Inbox,
  Gauge,
  ArrowRight,
} from "lucide-react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 animate-spin border-primary/30 border-t-primary" />
  </div>
);

const ease = [0.16, 1, 0.3, 1] as const;

const faqs = [
  { question: "What is cold email software?", answer: "Cold email software helps you reach people who have never heard of you with personalized one-to-one emails at scale — finding the right contacts, keeping your messages out of spam, automating follow-ups, and tracking replies. It is different from email marketing tools like Mailchimp, which send newsletters to people who already opted in." },
  { question: "How does OutReign keep my emails out of spam?", answer: "Every business email is verified through SMTP before it ever reaches your list, so you are not sending to dead addresses that hard-bounce and burn your domain reputation. The built-in deliverability suite also monitors placement, warmup, and sending limits across your connected inboxes." },
  { question: "How is this different from a tool like Instantly or Smartlead?", answer: "Those tools are senders: they deliver the list you load into them. OutReign tells you who is worth emailing in the first place — it scores every prospect against your ideal customer profile, verifies their contact data, and writes the message before anything is sent." },
  { question: "Does the AI write my cold emails for me?", answer: "Yes. OutReign drafts every first touch from the prospect's actual role, company, and context — not a template with a first-name token swapped in. You can review each draft, approve in batches, or let the AI SDR agent send autonomously." },
  { question: "Can I send cold email from my own domain?", answer: "Yes. OutReign connects to your Gmail or Google Workspace inboxes and sends from your own address, so prospects see a normal email from you. Multiple sending domains and inboxes are supported for scaling volume safely." },
  { question: "How much does cold email software cost?", answer: "OutReign starts free — 100 real lead searches and 100 emails a month, no credit card required. Paid plans run from $39 to $249 a month, each with a 14-day trial." },
];

const capabilities = [
  { icon: Target, title: "ICP scoring picks who to email", description: "Describe your ideal customer in plain English. Every prospect is scored for fit against that profile, so your sequence goes to the people most likely to reply — not the biggest list you could export." },
  { icon: ShieldCheck, title: "SMTP verification before every send", description: "Business emails are verified at the mailbox level before they touch your campaign. Fewer bounces means a protected domain reputation and a sender score that stays out of the spam folder." },
  { icon: Mail, title: "AI drafts every first touch", description: "Each message is written from the prospect's role, company, and context. No mail-merge templates, no [First Name] tokens — a draft that reads like you spent ten minutes researching them." },
  { icon: Repeat, title: "Follow-ups that run themselves", description: "Multi-touch sequences with timing rules and branching handle the nudges after the first send. If a prospect replies, the sequence stops — nobody gets chased after they answered." },
  { icon: Inbox, title: "One inbox for every reply", description: "Replies from all your sending inboxes land in a single view, classified by intent. Hot replies surface first, so you spend your time in conversations instead of triage." },
  { icon: Gauge, title: "Deliverability you can see", description: "Inbox placement checks, warmup, per-inbox sending limits, and bounce tracking are built in — so you know your cold email is landing before your pipeline tells you it isn't." },
];

const differences = [
  { legacy: "Buy a contact list, load it, pray", truth: "Prospects scored against your ICP before they ever enter a campaign" },
  { legacy: "Send to unverified addresses, watch bounces pile up", truth: "SMTP-verified emails only — your domain reputation stays intact" },
  { legacy: "One template blasted to thousands", truth: "A personalized draft for every prospect, written from real context" },
  { legacy: "Reply chaos across five inboxes", truth: "One reply inbox, classified by intent, hottest leads first" },
];

const shinyGradient = {
  backgroundImage: "linear-gradient(to right, #a78bfa 0%, #8b5cf6 15%, #c4b5fd 35%, #e9d5ff 50%, #c4b5fd 65%, #8b5cf6 85%, #a78bfa 100%)",
  backgroundSize: "200% auto",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  filter: "url(#c3-noise)",
};

const ColdEmailSoftware = () => {
  return (
    <>
      <SEOHead
        title="Cold Email Software That Lands in the Inbox | OutReign"
        description="OutReign is cold email software built for replies: ICP scoring picks who to email, SMTP verification keeps you out of spam, and AI drafts every message. Free plan included."
        socialTitle="Cold email software built for replies, not just sends."
        keywords="cold email software, cold email tool, cold outreach software, b2b cold email, cold email automation, email outreach software, cold email platform"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://outreign.io" },
        { name: "Cold Email Software", url: "https://outreign.io/cold-email-software" }
      ]} />
      <FAQSchema faqs={faqs} />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />
        <main>
          {/* Hero */}
          <section
            className="relative flex flex-col items-center justify-start overflow-hidden px-0 pt-[calc(env(safe-area-inset-top)+6rem)] pb-20 sm:pt-[calc(env(safe-area-inset-top)+8rem)] sm:pb-28"
            aria-labelledby="cold-email-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "radial-gradient(ellipse 70% 55% at 50% 0%, hsl(261 75% 50% / 0.10) 0%, transparent 65%)",
              }}
              aria-hidden="true"
            />

            <div className="relative z-20 mx-auto flex w-full max-w-[38rem] flex-col items-center px-5 text-center sm:max-w-5xl sm:px-6">
              {/* Badge */}
              <div className="mb-6 max-w-full sm:mb-10">
                <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-tight text-white/95 sm:flex-nowrap sm:gap-2.5 sm:px-4 sm:text-xs">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
                  </span>
                  <span className="font-medium text-white/95">Cold email</span>
                  <span className="text-white/85">·</span>
                  <span>find, verify, write, send — one platform</span>
                </span>
              </div>

              {/* H1 */}
              <h1
                id="cold-email-heading"
                className="font-display mb-5 max-w-[14ch] text-balance sm:mb-8 sm:max-w-none"
                style={{
                  fontSize: "clamp(2.75rem, 7vw, 5rem)",
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                  fontWeight: 800,
                  color: "hsl(0 0% 96%)",
                  textShadow: "0 4px 30px rgba(0,0,0,0.35)",
                }}
              >
                <span className="block text-white">Cold email software</span>
                <span className="block italic animate-shiny" style={shinyGradient}>
                  built for replies.
                </span>
              </h1>

              {/* Subhead */}
              <p
                className="mb-8 max-w-[26rem] text-pretty text-lg font-medium leading-snug text-white/90 sm:mb-10 sm:max-w-2xl sm:text-xl sm:leading-relaxed"
                style={{ textShadow: "0 4px 32px rgba(0,0,0,0.55)" }}
              >
                Most cold email tools just send what you load into them. OutReign scores every prospect against your ICP, verifies their inbox through SMTP, and has AI write the first touch — so the emails that leave are worth opening.
              </p>

              {/* CTAs */}
              <div className="mb-6 flex w-full max-w-[20rem] flex-col items-center gap-3 sm:mb-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4">
                <Link
                  to="/auth"
                  className="cta-pill-glow inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold text-white group sm:w-auto transition-transform active:scale-[0.98] hover:scale-[1.02]"
                  style={{ background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)" }}
                  aria-label="Start sending cold email free"
                >
                  Start sending free
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>

                <Link
                  to="/pricing"
                  className="inline-flex h-11 items-center justify-center gap-1.5 px-5 text-sm text-white/85 transition-all duration-200 hover:text-white hover:translate-x-0.5 sm:h-[52px]"
                  aria-label="Compare OutReign plans"
                >
                  Compare plans
                  <ArrowRight className="h-3.5 w-3.5 ml-0.5" aria-hidden="true" />
                </Link>
              </div>

              <p className="mb-3 flex max-w-[21rem] flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs leading-tight text-white/90 sm:flex-nowrap">
                100 free lead searches
                <span className="w-px h-3 bg-white/20 inline-block" />
                Sends from your own Gmail
                <span className="w-px h-3 bg-white/20 inline-block" />
                No credit card to start
              </p>

              <p className="text-xs text-center text-white/50">
                Built by operators who run real outbound every day
              </p>
            </div>
          </section>

          {/* Capabilities */}
          <section
            className="relative py-24 md:py-32 overflow-hidden"
            style={{ background: "transparent" }}
            aria-labelledby="cold-email-capabilities-heading"
          >
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-5xl mx-auto">
                <motion.p
                  className="font-serif italic font-thin text-base text-center text-purple-500 mb-5"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.6, ease }}
                >
                  What's inside
                </motion.p>

                <motion.h2
                  id="cold-email-capabilities-heading"
                  className="font-display mb-4 text-center"
                  style={{
                    fontSize: "clamp(2rem, 4vw, 3.2rem)",
                    fontWeight: 800,
                    lineHeight: 1.1,
                    letterSpacing: "-0.02em",
                    color: "hsl(0 0% 93%)",
                  }}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.08 }}
                >
                  Everything between "who do I email"
                  <br />
                  <span className="italic animate-shiny" style={shinyGradient}>
                    and "they replied."
                  </span>
                </motion.h2>

                <motion.p
                  className="text-center max-w-2xl mx-auto mb-14 text-base leading-relaxed"
                  style={{ color: "hsl(0 0% 100% / 0.7)" }}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.55, ease, delay: 0.15 }}
                >
                  One platform covers targeting, verification, drafting, sending, and replies — so you don't stitch five tools together to send one campaign.
                </motion.p>

                <motion.div
                  className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-10% 0px" }}
                  variants={{
                    hidden: {},
                    show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
                  }}
                >
                  {capabilities.map((cap) => (
                    <motion.div
                      key={cap.title}
                      className="rounded-2xl p-6 group"
                      style={{
                        background: "hsl(0 0% 100% / 0.03)",
                        border: "1px solid hsl(261 75% 50% / 0.15)",
                      }}
                      variants={{
                        hidden: { opacity: 0, y: 16 },
                        show: { opacity: 1, y: 0, transition: { duration: 0.55, ease } },
                      }}
                      whileHover={{ borderColor: "hsl(261 75% 50% / 0.35)" }}
                    >
                      <cap.icon className="h-5 w-5 mb-4" style={{ color: "hsl(261 75% 65%)" }} aria-hidden="true" />
                      <h3 className="font-semibold mb-2 text-white">{cap.title}</h3>
                      <p className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                        {cap.description}
                      </p>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />
          </section>

          {/* Differentiation */}
          <section
            className="relative py-24 md:py-32 overflow-hidden"
            style={{ background: "transparent" }}
            aria-labelledby="cold-email-difference-heading"
          >
            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-3xl mx-auto">
                <motion.p
                  className="font-serif italic font-thin text-base text-center text-purple-500 mb-5"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.6, ease }}
                >
                  The difference
                </motion.p>

                <motion.h2
                  id="cold-email-difference-heading"
                  className="font-display mb-14 text-center"
                  style={{
                    fontSize: "clamp(2.4rem, 5vw, 4rem)",
                    fontWeight: 800,
                    lineHeight: 1.08,
                    letterSpacing: "-0.02em",
                    color: "hsl(0 0% 95%)",
                  }}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.08 }}
                >
                  A sender makes your list louder.
                  <br />
                  <span className="italic animate-shiny" style={shinyGradient}>
                    We make it smarter first.
                  </span>
                </motion.h2>

                <motion.div
                  className="flex flex-col"
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-10% 0px" }}
                  variants={{
                    hidden: {},
                    show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
                  }}
                >
                  {differences.map((row, index) => (
                    <motion.div
                      key={index}
                      className="flex items-center gap-6 py-5 border-b"
                      style={{ borderColor: "hsl(261 75% 50% / 0.14)" }}
                      variants={{
                        hidden: { opacity: 0, y: 16 },
                        show: { opacity: 1, y: 0, transition: { duration: 0.55, ease } },
                      }}
                    >
                      <span className="flex-1 text-sm line-through leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.22)" }}>
                        {row.legacy}
                      </span>
                      <ArrowRight
                        className="flex-shrink-0 w-4 h-4"
                        style={{ color: "hsl(261 75% 50% / 0.5)" }}
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-sm font-medium leading-relaxed" style={{ color: "hsl(261 75% 72%)" }}>
                        {row.truth}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>

                <motion.div
                  className="mt-12 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.55, ease, delay: 0.38 }}
                >
                  <Link
                    to="/auth"
                    className="cta-pill-glow inline-flex h-[52px] items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold text-white transition-transform active:scale-[0.98] hover:scale-[1.02]"
                    style={{ background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)" }}
                  >
                    Start free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <p className="text-xs" style={{ color: "hsl(0 0% 100% / 0.25)" }}>
                    Free plan · 14-day trial on paid plans · Cancel anytime
                  </p>
                </motion.div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section
            className="relative py-24 md:py-36 overflow-hidden"
            style={{ background: "transparent" }}
            aria-labelledby="cold-email-faq-heading"
          >
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-[720px] mx-auto">
                <motion.p
                  className="font-serif italic font-thin text-base text-center text-purple-500 mb-5"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.6, ease }}
                >
                  FAQ
                </motion.p>

                <motion.h2
                  id="cold-email-faq-heading"
                  className="font-display text-center mb-14"
                  style={{
                    fontSize: "clamp(2rem, 4vw, 3.2rem)",
                    fontWeight: 800,
                    lineHeight: 1.1,
                    letterSpacing: "-0.02em",
                    color: "hsl(0 0% 93%)",
                  }}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.08 }}
                >
                  Questions about
                  <br />
                  <span className="italic animate-shiny" style={shinyGradient}>
                    cold email, answered.
                  </span>
                </motion.h2>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.55, ease, delay: 0.15 }}
                >
                  <Accordion type="single" collapsible className="flex flex-col">
                    {faqs.map((faq, index) => (
                      <AccordionItem
                        key={index}
                        value={`item-${index}`}
                        className="border-b"
                        style={{ borderColor: "hsl(261 75% 50% / 0.18)" }}
                      >
                        <AccordionTrigger
                          className="text-left py-5 hover:no-underline transition-colors duration-200 group"
                          style={{ color: "hsl(0 0% 80%)" }}
                        >
                          <span className="font-medium text-[15px] leading-snug group-hover:text-white transition-colors duration-200">
                            {faq.question}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent
                          className="pb-5 text-sm leading-relaxed"
                          style={{ color: "hsl(0 0% 100% / 0.7)" }}
                        >
                          {faq.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </motion.div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />
          </section>

          {/* Final CTA */}
          <section
            className="relative py-24 md:py-32 overflow-hidden"
            style={{ background: "transparent" }}
            aria-labelledby="cold-email-cta-heading"
          >
            <div className="container relative z-10 mx-auto px-6">
              <div className="flex flex-col items-center text-center">
                <motion.p
                  className="font-serif italic font-thin text-base text-center text-purple-500 mb-5"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.6, ease }}
                >
                  Ready when you are
                </motion.p>

                <h2
                  id="cold-email-cta-heading"
                  className="font-display mb-6"
                  style={{
                    fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
                    fontWeight: 800,
                    lineHeight: 1.08,
                    letterSpacing: "-0.02em",
                    color: "hsl(0 0% 96%)",
                  }}
                >
                  <motion.span
                    className="block"
                    initial={{ opacity: 0, y: 32 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-10% 0px" }}
                    transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.06 }}
                  >
                    Send cold email
                  </motion.span>
                  <motion.span
                    className="block italic animate-shiny"
                    style={shinyGradient}
                    initial={{ opacity: 0, y: 32 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-10% 0px" }}
                    transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.18 }}
                  >
                    that actually gets replies.
                  </motion.span>
                </h2>

                <motion.p
                  className="mb-10 max-w-xl text-base leading-relaxed"
                  style={{ color: "hsl(0 0% 100% / 0.7)" }}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.55, ease, delay: 0.28 }}
                >
                  Start on the free plan, connect your inbox, and send your first campaign today.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.55, ease, delay: 0.38 }}
                >
                  <Link
                    to="/auth"
                    className="cta-pill-glow inline-flex h-[52px] items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold text-white transition-transform active:scale-[0.98] hover:scale-[1.02]"
                    style={{ background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)" }}
                  >
                    Start free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </motion.div>
              </div>
            </div>
          </section>
        </main>

        <Suspense fallback={<SectionLoader />}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
};

export default ColdEmailSoftware;
