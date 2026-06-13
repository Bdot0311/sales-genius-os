import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { Link } from "react-router-dom";
import { lazy, Suspense } from "react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const SectionLoader = () => (
  <div className="py-16 flex items-center justify-center">
    <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: "hsl(261 75% 50% / 0.3)", borderTopColor: "hsl(261 75% 65%)" }} />
  </div>
);

const faqs = [
  {
    question: "What is email warmup?",
    answer:
      "Email warmup is the process of gradually increasing the volume of mail sent from a new or dormant mailbox so inbox providers like Gmail, Outlook, and Yahoo learn to trust your sender reputation. Skip it and your cold outreach lands in spam — or gets blocked outright.",
  },
  {
    question: "How long does warmup take?",
    answer:
      "Plan on 2–4 weeks for a brand-new domain or mailbox. The first week is a hard ceiling of 10–20 sends per day; you roughly double weekly until you hit your steady-state target. Domains with prior reputation move faster.",
  },
  {
    question: "Do I need SPF, DKIM, and DMARC?",
    answer:
      "Yes. SPF authorizes which servers can send for your domain, DKIM cryptographically signs each message, and DMARC tells receivers what to do when SPF or DKIM fail. Without all three configured correctly, Gmail and Yahoo will throttle or reject bulk sends under their 2024 sender requirements.",
  },
  {
    question: "Should I use a separate domain for cold outreach?",
    answer:
      "Recommended. Buy a lookalike domain (e.g. acmehq.com if your brand is acme.com), set up SPF/DKIM/DMARC, and warm it independently. That way a deliverability mistake on outbound never touches your transactional or marketing reputation.",
  },
  {
    question: "How do I know warmup is working?",
    answer:
      "Track three signals: inbox placement (use seed tests across Gmail/Outlook), bounce rate (must stay under 2%), and complaint rate (under 0.1%). Reply rate is the ultimate proof — replies are the strongest positive signal an inbox provider can see.",
  },
  {
    question: "Can I just send a few cold emails per day without warmup?",
    answer:
      "Under ~20/day from an established mailbox, you can usually skip dedicated warmup tools — but you still need correct SPF, DKIM, DMARC, and a clean sending pattern. Above that volume, warmup is non-negotiable.",
  },
];

const EmailWarmupGuide = () => {
  return (
    <>
      <SEOHead
        title="Email Warmup: The Complete 2026 Guide for Cold Outreach | OutReign"
        description="Step-by-step email warmup guide: SPF, DKIM, DMARC setup, a 4-week ramp schedule, and the deliverability signals that decide whether your cold emails land in inbox or spam."
        keywords="email warmup, email warm up, email warmup guide, cold email warmup, smtp warmup, domain warmup, spf dkim dmarc, sender reputation, cold email deliverability"
        ogImage="https://outreign.io/outreign-social-card.jpg"
      />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://outreign.io" },
          { name: "Guides", url: "https://outreign.io/guides" },
          { name: "Email Warmup", url: "https://outreign.io/guides/email-warmup" },
        ]}
      />
      <FAQSchema faqs={faqs} />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />
        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-16 sm:pt-[calc(env(safe-area-inset-top)+7rem)]"
            aria-labelledby="warmup-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(261 75% 55% / 0.08) 0%, transparent 65%)" }}
              aria-hidden="true"
            />
            <div className="container mx-auto px-5 sm:px-6 max-w-3xl relative z-10">
              <p className="font-serif italic font-thin text-base text-purple-500 mb-5 text-center">
                Deliverability Guide
              </p>
              <h1
                id="warmup-heading"
                className="font-display mb-6 text-center text-foreground"
                style={{ fontSize: "clamp(2.2rem, 5vw, 3.6rem)", lineHeight: 1.05 }}
              >
                Email Warmup: The Complete 2026 Guide
              </h1>
              <p className="text-lg text-muted-foreground mb-8 text-center max-w-2xl mx-auto">
                Everything you need to take a cold mailbox from zero to 200+ sends a day without
                landing in spam — authentication, ramp schedule, and the signals inbox providers
                actually score.
              </p>
            </div>
          </section>

          {/* Body */}
          <article className="container mx-auto px-5 sm:px-6 max-w-3xl pb-24 text-foreground/90 space-y-10 leading-relaxed">
            <section aria-labelledby="why">
              <h2 id="why" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Why warmup matters
              </h2>
              <p>
                Gmail, Outlook, and Yahoo decide where your message lands by scoring the sender,
                not the message. A brand-new domain or mailbox has zero reputation — and zero
                reputation is treated the same as bad reputation. Warmup is how you build a track
                record of legitimate sending behaviour before the first cold campaign ever goes
                out.
              </p>
              <p className="mt-3">
                Under the 2024 Gmail and Yahoo bulk sender rules, mailboxes sending more than
                5,000 messages a day to those providers must authenticate every message with SPF,
                DKIM, and DMARC, keep complaint rates under 0.3%, and offer one-click unsubscribe.
                Cold outbound at scale is squarely inside those rules.
              </p>
            </section>

            <section aria-labelledby="auth">
              <h2 id="auth" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Step 1 — Authenticate the domain (SPF, DKIM, DMARC)
              </h2>
              <p>
                Before sending a single warmup message, lock down authentication. Wrong records
                here will tank deliverability no matter how careful your ramp schedule is.
              </p>
              <ul className="list-disc pl-6 mt-4 space-y-2">
                <li>
                  <strong>SPF</strong> — Publish a TXT record listing every service authorized to
                  send for your domain. Keep it under 10 DNS lookups.
                </li>
                <li>
                  <strong>DKIM</strong> — Generate a 2048-bit key with your sending provider and
                  publish the public key as a TXT record at the provider-specified selector.
                </li>
                <li>
                  <strong>DMARC</strong> — Start at <code>p=none</code> with a reporting address,
                  monitor for two weeks, then move to <code>p=quarantine</code> and finally{" "}
                  <code>p=reject</code> once aligned traffic is clean.
                </li>
              </ul>
            </section>

            <section aria-labelledby="ramp">
              <h2 id="ramp" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Step 2 — Follow a 4-week ramp schedule
              </h2>
              <p>
                The goal is steady, predictable growth. Inbox providers reward gradual escalation
                and punish spikes.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-foreground/10">
                      <th className="text-left py-2 pr-4">Week</th>
                      <th className="text-left py-2 pr-4">Daily sends</th>
                      <th className="text-left py-2">Mix</th>
                    </tr>
                  </thead>
                  <tbody className="text-muted-foreground">
                    <tr className="border-b border-foreground/10">
                      <td className="py-2 pr-4">1</td>
                      <td className="py-2 pr-4">10–20</td>
                      <td className="py-2">80% warmup network, 20% real recipients</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="py-2 pr-4">2</td>
                      <td className="py-2 pr-4">25–40</td>
                      <td className="py-2">60% warmup, 40% real</td>
                    </tr>
                    <tr className="border-b border-foreground/10">
                      <td className="py-2 pr-4">3</td>
                      <td className="py-2 pr-4">50–80</td>
                      <td className="py-2">40% warmup, 60% real</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-4">4+</td>
                      <td className="py-2 pr-4">100–200</td>
                      <td className="py-2">20% warmup, 80% real outbound</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="signals">
              <h2 id="signals" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Step 3 — Watch the signals that decide placement
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Bounce rate</strong> — keep under 2%. Verify every address before send.
                </li>
                <li>
                  <strong>Complaint rate</strong> — keep under 0.1%. One-click unsubscribe in
                  every cold email.
                </li>
                <li>
                  <strong>Reply rate</strong> — the single strongest positive signal. Write to
                  earn replies, not opens.
                </li>
                <li>
                  <strong>Open rate</strong> — directional only. Apple Mail Privacy Protection
                  inflates it; don&apos;t optimize on it alone.
                </li>
              </ul>
            </section>

            <section aria-labelledby="mistakes">
              <h2 id="mistakes" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Common mistakes that kill warmup
              </h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Sending from your primary domain instead of a dedicated outbound domain.</li>
                <li>Skipping DMARC alignment because SPF and DKIM &quot;already pass&quot;.</li>
                <li>Using the same mailbox for cold outbound and transactional traffic.</li>
                <li>Spinning up 10 mailboxes on day one and blasting them at full volume.</li>
                <li>Buying lists without SMTP verification — bounces destroy reputation fastest.</li>
              </ul>
            </section>

            <section aria-labelledby="cta" className="pt-6">
              <h2 id="cta" className="text-2xl sm:text-3xl font-display mb-4 text-foreground">
                Skip the spreadsheet — let OutReign handle deliverability
              </h2>
              <p>
                OutReign pairs SMTP-verified leads with built-in sending discipline so you ramp
                from zero to inbox without juggling a warmup tool, a verifier, and a sequencer.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/auth"
                  className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-medium text-white"
                  style={{ background: "hsl(261 75% 55%)" }}
                >
                  Start free
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center px-5 py-2.5 rounded-md text-sm font-medium border border-foreground/15 text-foreground"
                >
                  See pricing
                </Link>
              </div>
            </section>

            <section aria-labelledby="faq" className="pt-6">
              <h2 id="faq" className="text-2xl sm:text-3xl font-display mb-6 text-foreground">
                Frequently asked questions
              </h2>
              <dl className="space-y-6">
                {faqs.map((f) => (
                  <div key={f.question}>
                    <dt className="font-semibold text-foreground mb-1">{f.question}</dt>
                    <dd className="text-muted-foreground">{f.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </article>
        </main>

        <Suspense fallback={<SectionLoader />}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
};

export default EmailWarmupGuide;
