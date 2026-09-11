import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Bot, Search, Mail, Inbox, Zap, ShieldCheck } from "lucide-react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "hsl(261 75% 50% / 0.3)", borderTopColor: "hsl(261 75% 65%)" }} />
  </div>
);

const faqs = [
  { question: "What is an AI SDR agent?", answer: "An AI SDR agent is software that does the work of a sales development representative autonomously: finding prospects that match your ideal customer profile, verifying their contact data, writing personalized outreach, and handling replies — without a human running each step." },
  { question: "How is an AI SDR agent different from a sequencing tool?", answer: "A sequencer sends the emails you loaded into it. An AI SDR agent decides who to email in the first place, scores each prospect against your ICP, writes the message from real prospect context, and keeps working the replies after the send." },
  { question: "Does the AI SDR send emails from my own inbox?", answer: "Yes. OutReign connects to your Gmail and sends from your address, so prospects see a normal one-to-one email from you — not a marketing blast from a shared domain." },
  { question: "What happens when a prospect replies?", answer: "Replies are classified by intent and the agent drafts the next response for your approval. Nothing sends without your say unless you explicitly turn on autonomous sending." },
  { question: "Do I need a sales background to use it?", answer: "No. You describe your customer in plain English — title, industry, company size — and the agent handles targeting, scoring, and drafting. Founders with zero outbound experience run full campaigns." },
  { question: "Can I try the AI SDR agent before paying?", answer: "Yes. The Explore plan is free forever with 100 real lead searches a month and no credit card required, and every plan — including the free one — ships the AI SDR. Paid plans start with a 14-day trial." },
];

const capabilities = [
  { icon: Search, title: "Autonomous lead discovery", description: "Describe your buyer in plain English. The agent searches, scores fit against your ICP, and ranks who to contact first — no boolean strings, no list building." },
  { icon: ShieldCheck, title: "Verified contact data", description: "Every business email is verified before it reaches your list, so the agent's sends land instead of bouncing and burning your domain." },
  { icon: Mail, title: "Personalized drafting at scale", description: "A first draft for every prospect, written from their role, company, and context — not a mail-merge template with a first-name token." },
  { icon: Inbox, title: "Reply handling", description: "Replies are classified by intent and the agent drafts the follow-up. Hot replies surface first so you spend your time on conversations, not triage." },
  { icon: Zap, title: "Approval-gated autonomy", description: "Review drafts one by one, in batches, or let the agent run fully autonomously. You set the level of oversight per campaign." },
  { icon: Bot, title: "Runs from your Gmail", description: "Sends come from your own address with normal deliverability, warmup, and sending limits handled for you." },
];

const divider = { borderTop: "1px solid hsl(261 75% 50% / 0.18)" } as const;

const AiSdrAgent = () => {
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
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-16 sm:pt-[calc(env(safe-area-inset-top)+7rem)]"
            aria-labelledby="ai-sdr-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(261 75% 55% / 0.08) 0%, transparent 65%)" }}
              aria-hidden="true"
            />
            <div className="container mx-auto px-5 sm:px-6 max-w-4xl text-center relative z-10">
              <p className="font-serif italic font-thin text-base text-purple-500 mb-5">
                AI SDR Agent
              </p>
              <h1
                id="ai-sdr-heading"
                className="font-display mb-6"
                style={{
                  fontSize: "clamp(2.2rem, 5vw, 3.8rem)",
                  fontWeight: 800,
                  lineHeight: 1.06,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                An AI SDR agent that runs your outbound.{" "}
                <br className="hidden sm:block" />
                Headcount of one.
              </h1>
              <p
                className="text-lg font-light max-w-2xl mx-auto mb-10"
                style={{ color: "hsl(0 0% 100% / 0.7)" }}
              >
                Describe your customer in plain English. The agent finds ranked prospects with verified emails, writes a first draft for each, and works the replies from your own Gmail — the output of a sales team, without hiring one.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-center px-7 py-3 rounded-full font-semibold text-sm text-white transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
                >
                  Start free — AI SDR included
                </Link>
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center px-7 py-3 rounded-full text-sm font-medium transition-colors"
                  style={{ border: "1px solid hsl(261 75% 50% / 0.3)", color: "hsl(0 0% 80%)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.5)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
                >
                  See how it works
                </Link>
              </div>
              <p className="mt-6 text-xs" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
                100 free lead searches · 14-day trial on paid plans · No credit card to start
              </p>
            </div>
          </section>

          {/* What the agent does */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="capabilities-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-5xl">
              <h2
                id="capabilities-heading"
                className="font-display text-center mb-4"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                What an AI SDR agent actually does
              </h2>
              <p className="text-center max-w-2xl mx-auto mb-12 font-light" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                Not a sequencer with a new label. The agent owns the whole top of funnel — targeting, verification, drafting, and replies — and asks for your approval only where you want it to.
              </p>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {capabilities.map((cap) => (
                  <div
                    key={cap.title}
                    className="rounded-2xl p-6"
                    style={{ background: "hsl(261 75% 50% / 0.05)", border: "1px solid hsl(261 75% 50% / 0.15)" }}
                  >
                    <cap.icon className="h-5 w-5 mb-4" style={{ color: "hsl(261 75% 65%)" }} aria-hidden="true" />
                    <h3 className="font-semibold mb-2" style={{ color: "hsl(0 0% 92%)" }}>{cap.title}</h3>
                    <p className="text-sm font-light leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>{cap.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* How it differs */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="difference-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl">
              <h2
                id="difference-heading"
                className="font-display text-center mb-12"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                Built for teams of one, not sales orgs of fifty
              </h2>
              <div className="space-y-8">
                <div>
                  <h3 className="font-semibold mb-2" style={{ color: "hsl(0 0% 92%)" }}>You describe the customer. The agent does the rest.</h3>
                  <p className="font-light leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                    Most outbound platforms assume you already know how to build lists, write sequences, and configure sending infrastructure. OutReign starts from a sentence — "founders of US seed-stage dev-tool startups" — and turns it into scored prospects, verified emails, and ready-to-send drafts.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2" style={{ color: "hsl(0 0% 92%)" }}>Autonomy with a handbrake.</h3>
                  <p className="font-light leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                    Every draft and every follow-up can wait for your approval, or you can let the agent send on its own once you trust it. Oversight is a setting per campaign, not a pricing tier.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2" style={{ color: "hsl(0 0% 92%)" }}>No seat minimums, no enterprise contract.</h3>
                  <p className="font-light leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                    The free plan ships the AI SDR with 100 real lead searches a month. Paid plans scale usage, not headcount — you will never be asked to book a demo to see a price.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="faq-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl">
              <h2
                id="faq-heading"
                className="font-display text-center mb-12"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.8rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                AI SDR agent questions, answered
              </h2>
              <div className="space-y-6">
                {faqs.map((faq) => (
                  <div
                    key={faq.question}
                    className="rounded-2xl p-6"
                    style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.12)" }}
                  >
                    <h3 className="font-semibold mb-2" style={{ color: "hsl(0 0% 92%)" }}>{faq.question}</h3>
                    <p className="text-sm font-light leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Final CTA */}
          <section className="py-16 sm:py-24 text-center" style={divider} aria-labelledby="cta-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-2xl">
              <h2
                id="cta-heading"
                className="font-display mb-5"
                style={{
                  fontSize: "clamp(1.8rem, 4vw, 2.6rem)",
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                Put an AI SDR agent on your pipeline today
              </h2>
              <p className="font-light mb-8" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                Free plan, real prospects, no credit card. Your first campaign can be running in minutes.
              </p>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center px-8 py-3.5 rounded-full font-semibold text-sm text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
              >
                Start free
              </Link>
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
