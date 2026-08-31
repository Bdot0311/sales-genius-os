import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Accessibility as AccessibilityIcon, Keyboard, Eye, Mail, ListChecks } from "lucide-react";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

const iconWrap = {
  background: "hsl(261 75% 50% / 0.1)",
  border: "1px solid hsl(261 75% 50% / 0.2)",
} as const;

const cardStyle = {
  background: "hsl(0 0% 100% / 0.03)",
  border: "1px solid hsl(0 0% 100% / 0.08)",
} as const;

const sections = [
  {
    icon: ListChecks,
    title: "Conformance status",
    body: "OutReign aims to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. We assess the marketing site and the product dashboard with automated tooling (axe-core and Lighthouse) on every release, plus manual keyboard and screen-reader passes on the flows most people use: sign-up, lead search, the reply inbox and settings. We consider the site partially conformant: most of the product meets Level AA, and known gaps are listed below.",
  },
  {
    icon: Keyboard,
    title: "What we have built in",
    body: "Every interactive control is reachable and operable by keyboard, with a visible focus ring. Dialogs and menus trap focus and close on Escape. Buttons and icon-only controls carry accessible names, form fields have programmatic labels, and decorative graphics are hidden from assistive technology. Headings follow a single-H1 outline per page, and page titles update on navigation so screen-reader users know where they landed.",
  },
  {
    icon: Eye,
    title: "Colour, contrast and motion",
    body: "The interface uses a dark theme with body text and controls meeting the 4.5:1 contrast minimum (3:1 for large text and UI boundaries). Colour is never the only way information is conveyed — status is always paired with a label or icon. Decorative background animations respect the operating system's reduce-motion preference. Text can be zoomed to 200% and the layout reflows down to 320px wide without loss of content.",
  },
];

const knownLimitations = [
  "Some third-party embeds (payment checkout, scheduling and analytics widgets) are outside our control and may not fully meet Level AA.",
  "A small number of dense data tables in the analytics and deliverability areas are easier to use on a larger screen than with a screen magnifier.",
  "The interface is currently available in English only; multi-language support is not yet offered.",
];

const Accessibility = () => {
  return (
    <>
      <SEOHead
        title="Accessibility Statement | OutReign"
        description="OutReign's accessibility statement: our WCAG 2.1 Level AA commitment, the assistive-technology support we build in, known limitations, and how to report a barrier."
        keywords="OutReign accessibility, WCAG 2.1 AA, accessibility statement, keyboard navigation, screen reader support"
      />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: "https://outreign.io" },
          { name: "Accessibility", url: "https://outreign.io/accessibility" },
        ]}
      />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />

        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-12 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-16"
            aria-labelledby="accessibility-heading"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
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

            <div className="relative z-10 container mx-auto px-5 sm:px-6 max-w-4xl">
              <div
                className="inline-flex items-center justify-center h-12 w-12 rounded-xl mb-6"
                style={iconWrap}
              >
                <AccessibilityIcon className="h-6 w-6" style={{ color: "hsl(261 75% 72%)" }} aria-hidden="true" />
              </div>
              <h1
                id="accessibility-heading"
                className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 leading-tight"
                style={{ color: "hsl(0 0% 98%)" }}
              >
                Accessibility statement
              </h1>
              <p className="text-base sm:text-lg leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.72)" }}>
                We want everyone to be able to run outbound with OutReign, including people who use screen
                readers, keyboard-only navigation, magnification or reduced motion. This statement explains
                where we stand, what still needs work, and how to reach a human if something blocks you.
              </p>
            </div>
          </section>

          {/* Sections */}
          <section className="pb-14 sm:pb-20">
            <div className="container mx-auto px-5 sm:px-6 max-w-4xl space-y-5">
              {sections.map(({ icon: Icon, title, body }) => (
                <article key={title} className="rounded-2xl p-6 sm:p-7" style={cardStyle}>
                  <div className="flex items-start gap-4">
                    <span
                      className="inline-flex items-center justify-center h-10 w-10 rounded-lg flex-shrink-0"
                      style={iconWrap}
                    >
                      <Icon className="h-5 w-5" style={{ color: "hsl(261 75% 72%)" }} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="text-lg sm:text-xl font-semibold mb-2" style={{ color: "hsl(0 0% 96%)" }}>
                        {title}
                      </h2>
                      <p className="text-sm sm:text-base leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.72)" }}>
                        {body}
                      </p>
                    </div>
                  </div>
                </article>
              ))}

              {/* Known limitations */}
              <article className="rounded-2xl p-6 sm:p-7" style={cardStyle}>
                <h2 className="text-lg sm:text-xl font-semibold mb-3" style={{ color: "hsl(0 0% 96%)" }}>
                  Known limitations
                </h2>
                <ul className="space-y-2">
                  {knownLimitations.map((item) => (
                    <li
                      key={item}
                      className="text-sm sm:text-base leading-relaxed flex gap-3"
                      style={{ color: "hsl(0 0% 100% / 0.72)" }}
                    >
                      <span aria-hidden="true" style={{ color: "hsl(261 75% 72%)" }}>
                        —
                      </span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </article>

              {/* Feedback */}
              <article className="rounded-2xl p-6 sm:p-7" style={cardStyle}>
                <div className="flex items-start gap-4">
                  <span
                    className="inline-flex items-center justify-center h-10 w-10 rounded-lg flex-shrink-0"
                    style={iconWrap}
                  >
                    <Mail className="h-5 w-5" style={{ color: "hsl(261 75% 72%)" }} aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-lg sm:text-xl font-semibold mb-2" style={{ color: "hsl(0 0% 96%)" }}>
                      Report a barrier
                    </h2>
                    <p className="text-sm sm:text-base leading-relaxed mb-3" style={{ color: "hsl(0 0% 100% / 0.72)" }}>
                      If any part of OutReign is hard or impossible to use, email us with the page, what you were
                      trying to do, and the assistive technology you use. We reply within two business days and
                      treat accessibility bugs as production issues.
                    </p>
                    <a
                      href="mailto:support@bdotindustries.com?subject=Accessibility%20feedback"
                      className="text-sm sm:text-base font-medium underline underline-offset-4 inline-flex items-center min-h-[44px]"
                      style={{ color: "hsl(261 75% 76%)" }}
                    >
                      support@bdotindustries.com
                    </a>
                  </div>
                </div>
              </article>

              <p className="text-xs sm:text-sm" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
                This statement applies to outreign.io and the OutReign web application. It was last reviewed and
                updated in August 2026, and is revisited whenever we ship a significant interface change.
              </p>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default Accessibility;
