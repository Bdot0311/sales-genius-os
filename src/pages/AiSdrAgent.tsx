import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Bot, Search, Mail, Inbox, Zap, ShieldCheck, ArrowRight } from "lucide-react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 animate-spin border-primary/30 border-t-primary" />
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
  { icon: Search, title: "Finds your next customers", description: "Describe your buyer in plain English. The agent searches, scores fit against your ICP, and ranks who to contact first — no boolean strings, no list building." },
  { icon: ShieldCheck, title: "Verifies every contact", description: "Business emails are verified before they reach your list, so the agent's sends land instead of bouncing and burning your domain." },
  { icon: Mail, title: "Writes the first touch", description: "A personalized first draft for every prospect, written from their role, company, and context — not a mail-merge template with a first-name token." },
  { icon: Inbox, title: "Works the replies", description: "Replies are classified by intent and the agent drafts the follow-up. Hot replies surface first so you spend your time on conversations, not triage." },
  { icon: Zap, title: "Runs on your terms", description: "Review drafts one by one, in batches, or let the agent send on its own. You set the level of oversight per campaign." },
  { icon: Bot, title: "Connects to your Gmail", description: "Sends come from your own address with normal deliverability, warmup, and sending limits handled for you." },
];

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

      <div className="min-h-screen overflow-x-hidden bg-background">
        <Navbar />
        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-16 sm:pt-[calc(env(safe-area-inset-top)+7rem)]"
            aria-labelledby="ai-sdr-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_70%_60%_at_50%_0%,hsl(var(--primary)/0.08)_0%,transparent_65%)]"
              aria-hidden="true"
            />
            <div className="container mx-auto px-5 sm:px-6 max-w-4xl text-center relative z-10">
              <p className="text-sm font-medium text-primary tracking-wide uppercase mb-5">
                AI SDR Agent
              </p>
              <h1
                id="ai-sdr-heading"
                className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-foreground mb-6 leading-[1.08]"
              >
                An AI SDR agent that runs your outbound.
                <span className="block text-gradient-animated">Headcount of one.</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
                Describe your customer in plain English. OutReign finds ranked prospects, verifies their emails, writes a first draft for each, and works the replies from your Gmail — the output of a sales team without the headcount.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/auth"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full font-semibold text-sm text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
                >
                  Start free
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center justify-center px-7 py-3 rounded-full text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  Compare plans
                </Link>
              </div>
              <p className="mt-6 text-xs text-muted-foreground">
                100 free lead searches · 14-day trial on paid plans · No credit card to start
              </p>
            </div>
          </section>

          {/* What the agent does */}
          <section className="py-16 sm:py-20 border-t border-border/40" aria-labelledby="capabilities-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-5xl">
              <h2
                id="capabilities-heading"
                className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center text-foreground mb-4"
              >
                What the agent does for you
              </h2>
              <p className="text-center max-w-2xl mx-auto mb-12 text-muted-foreground leading-relaxed">
                Not a sequencer with a new label. The agent owns the whole top of funnel — targeting, verification, drafting, and replies — and asks for your approval only where you want it.
              </p>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {capabilities.map((cap) => (
                  <div
                    key={cap.title}
                    className="rounded-2xl p-6 bg-primary/5 border border-primary/15 hover:border-primary/30 transition-colors"
                  >
                    <cap.icon className="h-5 w-5 mb-4 text-primary" aria-hidden="true" />
                    <h3 className="font-semibold mb-2 text-foreground">{cap.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{cap.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* How it differs */}
          <section className="py-16 sm:py-20 border-t border-border/40" aria-labelledby="difference-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl">
              <h2
                id="difference-heading"
                className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center text-foreground mb-12"
              >
                Built for lean teams, not enterprise sales floors
              </h2>
              <div className="space-y-8">
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Start with a sentence, not a spreadsheet.</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Most outbound tools assume you already know how to build lists, write sequences, and configure sending infrastructure. OutReign starts from plain English — "founders of US seed-stage dev-tool startups" — and turns it into scored prospects, verified emails, and ready-to-send drafts.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">Autonomy with a handbrake.</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Every draft and every follow-up can wait for your approval, or you can let the agent send on its own once you trust it. Oversight is a setting per campaign, not a pricing tier.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">No seat minimums. No demo required.</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    The free plan ships the AI SDR with 100 real lead searches a month. Paid plans scale usage, not headcount — you will never be asked to book a call just to see a price.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="py-16 sm:py-20 border-t border-border/40" aria-labelledby="faq-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl">
              <h2
                id="faq-heading"
                className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center text-foreground mb-12"
              >
                Common questions
              </h2>
              <div className="space-y-4">
                {faqs.map((faq) => (
                  <div
                    key={faq.question}
                    className="rounded-2xl p-6 bg-primary/[0.03] border border-primary/10"
                  >
                    <h3 className="font-semibold mb-2 text-foreground">{faq.question}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Final CTA */}
          <section className="py-16 sm:py-24 text-center border-t border-border/40" aria-labelledby="cta-heading">
            <div className="container mx-auto px-5 sm:px-6 max-w-2xl">
              <h2
                id="cta-heading"
                className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mb-5"
              >
                Put an AI SDR agent on your pipeline today
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Free plan, real prospects, no credit card. Your first campaign can be running in minutes.
              </p>
              <Link
                to="/auth"
                className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full font-semibold text-sm text-primary-foreground bg-primary hover:bg-primary/90 transition-colors"
              >
                Start free
                <ArrowRight className="w-4 h-4" />
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
