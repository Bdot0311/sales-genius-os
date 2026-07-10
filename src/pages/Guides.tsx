import { Link } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";
import { lazy, Suspense } from "react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

type Guide = {
  slug: string;
  title: string;
  description: string;
  category: string;
  readingTime: string;
};

const GUIDES: Guide[] = [
  {
    slug: "b2b-icp-criteria-template",
    title: "B2B ICP Criteria & Template for Revenue Operations",
    description:
      "A deep-dive on defining an Ideal Customer Profile with tiering, scoring, and a copy-paste template built for revenue ops teams.",
    category: "ICP & Targeting",
    readingTime: "12 min read",
  },
  {
    slug: "email-warmup",
    title: "Email Warmup: The Complete Playbook",
    description:
      "How to warm up new sending domains and mailboxes without burning deliverability — schedules, volumes, and monitoring.",
    category: "Deliverability",
    readingTime: "9 min read",
  },
];

const divider = { borderTop: "1px solid hsl(261 75% 50% / 0.18)" } as const;

const Guides = () => {
  return (
    <>
      <SEOHead
        title="OutReign Guides — In-Depth Playbooks for Outbound & RevOps"
        description="Long-form guides and templates on ICP, outbound sequences, deliverability, and revenue operations. Practical playbooks, not blog posts."
        keywords="B2B outbound guides, ICP template, revenue operations playbook, cold email guide, sales prospecting templates"
        ogImage="https://outreign.io/outreign-social-card.jpg"
      />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://outreign.io" },
          { name: "Guides", url: "https://outreign.io/guides" },
        ]}
      />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />

        <main>
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-16 sm:pt-[calc(env(safe-area-inset-top)+7rem)]"
            aria-labelledby="guides-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
              aria-hidden="true"
            />
            <div
              className="absolute top-[-120px] left-[-100px] h-[420px] w-[420px] rounded-full hero-orb pointer-events-none sm:h-[560px] sm:w-[560px]"
              style={{
                background:
                  "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.16) 0%, hsl(261 75% 55% / 0.04) 50%, transparent 70%)",
                filter: "blur(40px)",
              }}
              aria-hidden="true"
            />
            <div className="noise-texture" aria-hidden="true" />

            <div className="relative z-10 container mx-auto px-5 sm:px-6 max-w-4xl text-center">
              <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                Guides · Playbooks & templates
              </span>

              <h1
                id="guides-heading"
                className="font-display mb-5 text-4xl leading-[1.05] sm:text-5xl md:text-6xl"
                style={{ color: "hsl(0 0% 95%)", fontWeight: 800, letterSpacing: "-0.02em" }}
              >
                Deep guides.{" "}
                <span
                  className="font-display italic animate-shiny"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Real templates.
                </span>
              </h1>
              <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                Long-form playbooks on ICP, outbound sequences, and deliverability — with copy-paste templates you can use today.
              </p>
            </div>
          </section>

          <section className="container mx-auto px-5 sm:px-6 max-w-3xl pb-24" style={divider}>
            <div className="flex flex-col gap-0 pt-2">
              {GUIDES.map((guide) => (
                <article
                  key={guide.slug}
                  className="py-10"
                  style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.12)" }}
                >
                  <p
                    className="text-[10px] uppercase tracking-widest mb-3 font-medium"
                    style={{ color: "hsl(261 75% 55%)" }}
                  >
                    {guide.category} · {guide.readingTime}
                  </p>
                  <h2 className="text-xl font-semibold mb-2 leading-snug" style={{ color: "hsl(0 0% 90%)" }}>
                    <Link
                      to={`/guides/${guide.slug}`}
                      className="transition-colors duration-150 hover:text-white"
                      style={{ color: "hsl(0 0% 90%)" }}
                    >
                      {guide.title}
                    </Link>
                  </h2>
                  <p className="text-sm leading-relaxed mb-4 max-w-xl" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                    {guide.description}
                  </p>
                  <Link
                    to={`/guides/${guide.slug}`}
                    className="text-sm font-medium transition-colors duration-150"
                    style={{ color: "hsl(261 75% 62%)" }}
                  >
                    Read guide →
                  </Link>
                </article>
              ))}
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

export default Guides;
