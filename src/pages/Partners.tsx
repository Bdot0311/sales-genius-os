import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowUpRight, ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { FooterSection } from "@/components/landing/FooterSection";
import { SEOHead } from "@/components/seo/SEOHead";
import { BRAND } from "@/lib/brand";

type Partner = {
  name: string;
  url: string;
  /** Short label shown as a chip — what the partner does */
  category: string;
  /** One-line summary in the partner's own words */
  pitch: string;
  /** How it fits alongside OutReign */
  fit: string;
  /** Monogram shown in the logo tile when no logo image resolves */
  monogram: string;
  /** Optional logo image; falls back to the monogram on load error */
  logoUrl?: string;
};

const partners: Partner[] = [
  {
    name: "KoldMail",
    url: "https://koldmail.io",
    category: "Cold email infrastructure",
    pitch:
      "Scale cold email without dealing with domains, inboxes, or setup. KoldMail handles the infrastructure so you can focus on booking more meetings.",
    fit: "OutReign finds, scores, and drafts who to reach. KoldMail gives you the sending infrastructure to run that outreach at volume, without managing domains and inboxes yourself.",
    monogram: "K",
    logoUrl: "https://logo.clearbit.com/koldmail.io",
  },
];

/** Logo tile: real logo on a light chip, gradient monogram if it can't load. */
function PartnerLogo({ partner }: { partner: Partner }) {
  const [failed, setFailed] = useState(!partner.logoUrl);

  if (failed) {
    return (
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl font-display text-xl font-bold"
        style={{
          background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 48%))",
          color: "hsl(0 0% 100%)",
        }}
        aria-hidden="true"
      >
        {partner.monogram}
      </div>
    );
  }

  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl overflow-hidden"
      style={{ background: "hsl(0 0% 100% / 0.94)", border: "1px solid hsl(0 0% 100% / 0.1)" }}
    >
      <img
        src={partner.logoUrl}
        alt={`${partner.name} logo`}
        width={40}
        height={40}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-9 w-9 object-contain"
      />
    </div>
  );
}

export default function Partners() {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Partners — Tools That Work Alongside OutReign"
        description="Independent tools and vendors OutReign partners with. Cold email infrastructure, deliverability, and more, picked to complement your outbound workflow."
        canonicalUrl={`${BRAND.url}/partners`}
      />

      <Navbar />

      <main
        className="relative min-h-screen overflow-hidden"
        style={{ background: "hsl(261 75% 2%)", color: "hsl(0 0% 92%)" }}
      >
        {/* Ambient glow + noise to echo the landing page */}
        <div
          className="absolute top-0 left-1/2 h-[420px] w-full max-w-[800px] -translate-x-1/2 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at center top, hsl(261 75% 55% / 0.12) 0%, transparent 65%)" }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(0 0% 100% / 0.05) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage: "linear-gradient(to bottom, black, transparent 40%)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent 40%)",
          }}
          aria-hidden="true"
        />
        <div className="noise-texture" aria-hidden="true" />

        <div className="relative z-10">
          {/* Back button */}
          <div className="max-w-3xl mx-auto px-6 pt-24">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: "hsl(0 0% 100% / 0.6)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(261 75% 70%)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.6)")}
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          </div>

          {/* Hero */}
          <div className="max-w-3xl mx-auto px-6 pt-8 pb-14 text-center">
            <p className="font-serif italic text-base mb-4" style={{ color: "hsl(261 75% 65%)" }}>
              Partners
            </p>
            <h1
              className="font-display font-bold mb-6"
              style={{ fontSize: "clamp(2.25rem, 6vw, 4rem)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
            >
              <span className="block" style={{ color: "hsl(0 0% 96%)" }}>
                Tools we
              </span>
              <span
                className="block font-display italic animate-shiny"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "url(#c3-noise)",
                }}
              >
                collaborate with
              </span>
            </h1>
            <p
              className="text-lg font-light leading-relaxed"
              style={{ color: "hsl(0 0% 100% / 0.7)", maxWidth: "58ch", margin: "0 auto" }}
            >
              OutReign covers finding, scoring, and drafting your outbound. These are independent
              tools we partner with to handle the parts that sit next to it, picked because we'd
              actually use them ourselves.
            </p>
          </div>

          {/* Partner list */}
          <div className="max-w-3xl mx-auto px-6 pb-20">
            <ul className="space-y-6">
              {partners.map((p) => (
                <li key={p.name}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block rounded-2xl p-7 transition-colors"
                    style={{
                      background: "hsl(0 0% 100% / 0.03)",
                      border: "1px solid hsl(261 75% 50% / 0.18)",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 55% / 0.4)")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.18)")}
                  >
                    <div className="flex items-start gap-5">
                      <PartnerLogo partner={p} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h2 className="font-display text-xl font-bold" style={{ color: "hsl(0 0% 96%)" }}>
                            {p.name}
                          </h2>
                          <span
                            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                            style={{ background: "hsl(261 75% 50% / 0.14)", color: "hsl(261 75% 72%)" }}
                          >
                            {p.category}
                          </span>
                          <ArrowUpRight
                            className="h-4 w-4 ml-auto shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                            style={{ color: "hsl(0 0% 100% / 0.4)" }}
                          />
                        </div>

                        <p className="mt-3 text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.72)" }}>
                          {p.pitch}
                        </p>

                        <p
                          className="mt-4 pt-4 text-sm leading-relaxed"
                          style={{
                            color: "hsl(0 0% 100% / 0.55)",
                            borderTop: "1px solid hsl(261 75% 50% / 0.12)",
                          }}
                        >
                          <span style={{ color: "hsl(261 75% 70%)" }}>How it fits: </span>
                          {p.fit}
                        </p>
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>

            <p className="text-xs mt-6 text-center" style={{ color: "hsl(0 0% 100% / 0.35)" }}>
              Partners are independent companies, not part of OutReign. We share them because they
              pair well with how our customers run outbound.
            </p>
          </div>

          {/* Become a partner */}
          <div
            className="max-w-3xl mx-auto px-6 pb-20"
            style={{ borderTop: "1px solid hsl(261 75% 50% / 0.12)" }}
          >
            <div className="pt-16 text-center">
              <h2
                className="font-display font-bold mb-4"
                style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)", letterSpacing: "-0.02em" }}
              >
                Building something that pairs with OutReign?
              </h2>
              <p className="mb-8 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)", maxWidth: "48ch", margin: "0 auto 2rem" }}>
                If you run a tool our customers would benefit from, we're open to collaborating.
              </p>
              <a
                href={`mailto:${BRAND.email}?subject=Partnership%20inquiry`}
                className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
              >
                Get in touch
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          {/* CTA back to product */}
          <div
            className="py-20 text-center px-6"
            style={{ borderTop: "1px solid hsl(261 75% 50% / 0.15)" }}
          >
            <h2
              className="font-display font-bold mb-4"
              style={{ fontSize: "clamp(1.5rem, 3vw, 2.25rem)", letterSpacing: "-0.02em" }}
            >
              New to OutReign?
            </h2>
            <p className="mb-8 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
              Free plan. No credit card. 10 lead searches included.
            </p>
            <button
              onClick={() => navigate("/auth")}
              className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
            >
              Get 10 free leads
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>

      <FooterSection />
    </>
  );
}
