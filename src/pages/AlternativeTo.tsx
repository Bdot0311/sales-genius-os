import { Link, Navigate, useParams } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, FAQSchema } from "@/components/seo";
import { competitorBySlug } from "@/data/competitors";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection })),
);

const divider = { borderTop: "1px solid hsl(261 75% 50% / 0.18)" } as const;

/**
 * One page per tool people are searching to replace.
 *
 * "{tool} alternative" is the highest-intent query in this category — the
 * person typing it has already decided to leave and is choosing where to go —
 * and the site had exactly one of them, for Apollo.
 *
 * The content is data, not markup, so adding a tool is an entry in
 * src/data/competitors.ts rather than another 300-line page to keep in sync.
 * That file carries the rule these pages live by: everything asserted about
 * OutReign is verifiable from this repository, and nothing is asserted about a
 * competitor beyond its product category. No rival prices, no limits, no
 * quality claims — those change without notice, and a page that is wrong about
 * someone else's product is worse than no page.
 *
 * Deliberately no page for a tool that already has a /vs- one. Two pages of
 * ours in front of the same searcher splits the authority rather than ranking
 * either.
 */
const AlternativeTo = () => {
  const { slug } = useParams<{ slug: string }>();
  const tool = competitorBySlug(slug ?? "");

  // An unknown slug is not a page. Sending it to /blog-style 404 keeps a typo
  // out of the index rather than serving a thin page for it.
  if (!tool) return <Navigate to="/cold-email-software" replace />;

  const canonical = `https://outreign.io/alternatives/${tool.slug}`;
  const title = `${tool.name} Alternative | OutReign`;

  return (
    <>
      <SEOHead
        title={title}
        description={`${tool.intent}. OutReign finds the prospects, scores them against your ICP, writes the email and handles the reply. Free to start.`}
        keywords={`${tool.name} alternative, alternative to ${tool.name}, ${tool.name} competitors, ${tool.name} replacement, switch from ${tool.name}, best ${tool.name} alternative`}
        canonicalUrl={canonical}
      />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://outreign.io" },
          { name: `${tool.name} Alternative`, url: canonical },
        ]}
      />
      <FAQSchema faqs={tool.faqs} />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />
        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-16 sm:pt-[calc(env(safe-area-inset-top)+7rem)]"
            aria-labelledby="alt-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse 70% 60% at 50% 0%, hsl(261 75% 55% / 0.08) 0%, transparent 65%)",
              }}
              aria-hidden="true"
            />
            <div className="container relative z-10 mx-auto max-w-4xl px-5 text-center sm:px-6">
              <p className="font-serif text-base font-thin italic text-purple-500 mb-5">
                Why switch
              </p>
              <h1
                id="alt-heading"
                className="font-display mb-6"
                style={{
                  fontSize: "clamp(2rem, 5vw, 3.5rem)",
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: "-0.03em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                The {tool.name} alternative that finds the prospects too
              </h1>
              <p
                className="mx-auto mb-9 max-w-2xl text-lg font-light leading-relaxed"
                style={{ color: "hsl(0 0% 100% / 0.6)" }}
              >
                {tool.name} is {tool.category}. OutReign describes the job differently: say who
                you want in plain English, and it returns ranked, verified people, writes each
                email from real research, sends it, and handles the reply.
              </p>
              <a
                href="/auth"
                className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)",
                }}
              >
                Start free <ArrowRight className="h-4 w-4" />
              </a>
              <p className="mt-4 text-xs" style={{ color: "hsl(0 0% 100% / 0.4)" }}>
                100 lead searches a month on the free plan. No card.
              </p>
            </div>
          </section>

          {/* What the switcher is looking for */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="reasons-heading">
            <div className="container mx-auto max-w-4xl px-5 sm:px-6">
              <h2
                id="reasons-heading"
                className="font-display mb-10 text-center"
                style={{
                  fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                What people want when they look for a {tool.name} alternative
              </h2>
              <ul className="grid gap-5 sm:grid-cols-2">
                {tool.reasons.map((reason) => (
                  <li
                    key={reason.looking}
                    className="rounded-2xl p-6"
                    style={{
                      background: "hsl(261 75% 50% / 0.05)",
                      border: "1px solid hsl(261 75% 50% / 0.15)",
                    }}
                  >
                    <p
                      className="mb-2 flex items-start gap-2 text-base font-semibold"
                      style={{ color: "hsl(0 0% 95%)" }}
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                      {reason.looking}
                    </p>
                    <p
                      className="text-sm font-light leading-relaxed"
                      style={{ color: "hsl(0 0% 100% / 0.6)" }}
                    >
                      {reason.outreign}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* FAQ */}
          <section className="py-16 sm:py-20" style={divider} aria-labelledby="alt-faq-heading">
            <div className="container mx-auto max-w-3xl px-5 sm:px-6">
              <h2
                id="alt-faq-heading"
                className="font-display mb-10 text-center"
                style={{
                  fontSize: "clamp(1.5rem, 3.5vw, 2.25rem)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 95%)",
                }}
              >
                Questions people ask before switching
              </h2>
              <dl className="space-y-8">
                {tool.faqs.map((faq) => (
                  <div key={faq.question}>
                    <dt
                      className="mb-2 text-base font-semibold"
                      style={{ color: "hsl(0 0% 95%)" }}
                    >
                      {faq.question}
                    </dt>
                    <dd
                      className="text-sm font-light leading-relaxed"
                      style={{ color: "hsl(0 0% 100% / 0.6)" }}
                    >
                      {faq.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {/* Where to go next. These pages are only worth ranking if they lead
              somewhere, and a leaf passes nothing to the rest of the site. */}
          <section className="py-14" style={divider} aria-labelledby="alt-next-heading">
            <div className="container mx-auto max-w-3xl px-5 sm:px-6">
              <h2
                id="alt-next-heading"
                className="mb-5 text-[10px] font-medium uppercase tracking-widest"
                style={{ color: "hsl(0 0% 100% / 0.4)" }}
              >
                Keep reading
              </h2>
              <ul className="space-y-px">
                {tool.related.map((link) => (
                  <li key={link.href}>
                    <Link
                      to={link.href}
                      className="-mx-4 block rounded-lg px-4 py-3 text-base font-medium transition-colors duration-150 hover:bg-white/[0.03]"
                      style={{ color: "hsl(0 0% 88%)" }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/pricing"
                    className="-mx-4 block rounded-lg px-4 py-3 text-base font-medium transition-colors duration-150 hover:bg-white/[0.03]"
                    style={{ color: "hsl(0 0% 88%)" }}
                  >
                    What OutReign costs
                  </Link>
                </li>
              </ul>
            </div>
          </section>
        </main>

        <Suspense fallback={null}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
};

export default AlternativeTo;
