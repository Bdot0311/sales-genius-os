import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link, useNavigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { motion } from "motion/react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Bot,
  Search,
  Mail,
  Inbox,
  Zap,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { CAMPAIGN_SETUP_BOOKING_URL, openCampaignSetupBooking } from "@/lib/campaign-setup";
import { useIsSignedIn } from "@/hooks/use-signed-in";

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
  { question: "What is an AI SDR agent?", answer: "An AI SDR agent is software that does the work of a sales development representative autonomously: finding prospects that match your ideal customer profile, verifying their contact data, writing personalized outreach, and handling replies — without a human running each step." },
  { question: "How is an AI SDR agent different from a sequencing tool?", answer: "A sequencer sends the emails you loaded into it. An AI SDR agent decides who to email in the first place, scores each prospect against your ICP, writes the message from real prospect context, and keeps working the replies after the send." },
  { question: "Does the AI SDR send emails from my own inbox?", answer: "Yes. OutReign connects to your Gmail and sends from your address, so prospects see a normal one-to-one email from you — not a marketing blast from a shared domain." },
  { question: "What happens when a prospect replies?", answer: "Replies are classified by intent and the agent drafts the next response for your approval. Nothing sends without your say unless you explicitly turn on autonomous sending." },
  { question: "Do I need a sales background to use it?", answer: "No. You describe your customer in plain English — title, industry, company size — and the agent handles targeting, scoring, and drafting. Founders with zero outbound experience run full campaigns." },
  { question: "Can I try the AI SDR agent before paying?", answer: "Yes. The Explore plan is free forever with 100 real lead searches a month and no credit card required, and every plan — including the free one — ships the AI SDR. Paid plans start with a 14-day trial." },
];

const capabilities = [
  { icon: Search, title: "Finds your next customers", description: "Describe your buyer in plain English. The agent searches, scores fit against your ICP, and ranks who to contact first — no boolean strings, no list building." },
  { icon: ShieldCheck, title: "Verifies every contact", description: "Business emails are verified before they reach your list, so the agent's sends land instead of bouncing and burning your domain." },
  { icon: Mail, title: "Writes the first touch", description: "A personalized first draft for every prospect, written from their role, company, and context — not a mail-merge template with a first-name token." },
  { icon: Inbox, title: "Works the replies", description: "Replies are classified by intent and the agent drafts the follow-up. Hot replies surface first so you spend your time on conversations, not triage." },
  { icon: Zap, title: "Runs on your terms", description: "Review drafts one by one, in batches, or let the agent send on its own. You set the level of oversight per campaign." },
  { icon: Bot, title: "Connects to your Gmail", description: "Sends come from your own address with normal deliverability, warmup, and sending limits handled for you." },
];

const differences = [
  { legacy: "Hire an SDR, train them, buy data and tools", truth: "One agent that finds, verifies, drafts, and follows up" },
  { legacy: "Spreadsheets, list exports, and manual uploads", truth: "Ranked prospects scored by ICP fit, ready to email" },
  { legacy: "Templates with a first-name mail merge", truth: "Drafts written from real prospect and company context" },
  { legacy: "Inbox chaos after the first send", truth: "Replies classified and drafted for you, hot leads first" },
];

const shinyGradient = {
  backgroundImage: "linear-gradient(to right, #a78bfa 0%, #8b5cf6 15%, #c4b5fd 35%, #e9d5ff 50%, #c4b5fd 65%, #8b5cf6 85%, #a78bfa 100%)",
  backgroundSize: "200% auto",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  filter: "url(#c3-noise)",
};

const AiSdrAgent = () => {
  const signedIn = useIsSignedIn();
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="AI SDR Agent — Autonomous Outbound Sales | OutReign"
        description="OutReign's AI SDR agent finds your prospects, verifies their emails, writes personalized outreach, and works the replies from your Gmail. Free plan included."
        socialTitle="An AI SDR agent that runs your outbound. Headcount of one."
        keywords="ai sdr agent, ai sdr, ai sales agent, ai sales development representative, autonomous sales agent, ai outbound agent, ai sdr software, ai sdr tool"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://outreign.io" },
        { name: "AI SDR Agent", url: "https://outreign.io/ai-sdr-agent" }
      ]} />
      <FAQSchema faqs={faqs} />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />
        <main>
          {/* Hero */}
          <section
            className="relative flex flex-col items-center justify-start overflow-hidden px-0 pt-[calc(env(safe-area-inset-top)+6rem)] pb-20 sm:pt-[calc(env(safe-area-inset-top)+8rem)] sm:pb-28"
            aria-labelledby="ai-sdr-heading"
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
                  <span className="font-medium text-white/95">New</span>
                  <span className="text-white/85">·</span>
                  <span>every plan ships an AI SDR, the free one included</span>
                </span>
              </div>

              {/* H1 */}
              <h1
                id="ai-sdr-heading"
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
                <span className="block text-white">An AI SDR agent</span>
                <span className="block italic animate-shiny" style={shinyGradient}>
                  that runs your outbound.
                </span>
              </h1>

              {/* Subhead */}
              <p
                className="mb-8 max-w-[26rem] text-pretty text-lg font-medium leading-snug text-white/90 sm:mb-10 sm:max-w-2xl sm:text-xl sm:leading-relaxed"
                style={{ textShadow: "0 4px 32px rgba(0,0,0,0.55)" }}
              >
                Describe your customer in plain English. OutReign finds ranked prospects, verifies their emails, writes a first draft for each, and works the replies from your Gmail — the output of a sales team without the headcount.
              </p>

              {/* CTAs */}
              <div className="mb-6 flex w-full max-w-[20rem] flex-col items-center gap-3 sm:mb-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4">
                <a
                  href={CAMPAIGN_SETUP_BOOKING_URL}
                  onClick={(e) => { e.preventDefault(); void openCampaignSetupBooking("ai_sdr_hero_book_setup", null, { signedIn }); }}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cta-pill-glow inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold text-white group sm:w-auto transition-transform active:scale-[0.98] hover:scale-[1.02]"
                  style={{ background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)" }}
                  aria-label="Claim your free campaign setup"
                >
                  Get your free campaign setup
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </a>

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
                14-day trial on paid plans
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
            aria-labelledby="capabilities-heading"
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
                  What it does
                </motion.p>

                <motion.h2
                  id="capabilities-heading"
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
                  Not a sequencer with a new label.
                  <br />
                  <span className="italic animate-shiny" style={shinyGradient}>
                    A full top-of-funnel agent.
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
                  The agent owns targeting, verification, drafting, and replies — and asks for your approval only where you want it.
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
            aria-labelledby="difference-heading"
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
                  id="difference-heading"
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
                  Built for lean teams,
                  <br />
                  <span className="italic animate-shiny" style={shinyGradient}>
                    not enterprise sales floors.
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
            aria-labelledby="faq-heading"
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
                  id="faq-heading"
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
                  Questions we actually
                  <br />
                  <span className="italic animate-shiny" style={shinyGradient}>
                    get asked.
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
            aria-labelledby="cta-heading"
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
                  id="cta-heading"
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
                    Put an AI SDR agent
                  </motion.span>
                  <motion.span
                    className="block italic animate-shiny"
                    style={shinyGradient}
                    initial={{ opacity: 0, y: 32 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-10% 0px" }}
                    transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.18 }}
                  >
                    on your pipeline today.
                  </motion.span>
                </h2>

                <motion.p
                  className="text-base sm:text-lg font-light max-w-md mx-auto mb-10"
                  style={{ color: "hsl(0 0% 100% / 0.7)" }}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.55, ease, delay: 0.3 }}
                >
                  Free plan, real prospects, no credit card. Your first campaign can be running in minutes.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.5, ease, delay: 0.42 }}
                >
                  <motion.a
                    href={CAMPAIGN_SETUP_BOOKING_URL}
                    onClick={(e) => { e.preventDefault(); void openCampaignSetupBooking("ai_sdr_final_cta_book_setup", null, { signedIn }); }}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="cta-pill-glow inline-flex items-center gap-2 px-10 rounded-full text-sm font-semibold text-white"
                    style={{
                      height: "56px",
                      background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)",
                    }}
                    aria-label="Book a time to set up campaigns"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Book a time to set up campaigns
                    <ArrowRight className="w-4 h-4" />
                  </motion.a>

                  <div className="mt-4">
                    <Link
                      to="/pricing"
                      className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-medium transition-colors"
                      style={{ color: "hsl(261 75% 68%)" }}
                    >
                      See what each plan sends per month
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  <p className="mt-4 text-xs" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                    No card to start · 14-day trial on paid plans · 30 days to get your money back
                  </p>
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

export default AiSdrAgent;
