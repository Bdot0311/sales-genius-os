import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

const linkStyle = { color: "hsl(261 75% 65%)" } as const;
const bodyColor = "hsl(0 0% 100% / 0.6)";

const Terms = () => {
  return (
    <>
      <SEOHead
        title="Terms of Service - User Agreement & Policies | OutReign"
        description="Review the OutReign Terms of Service. Understand your rights and responsibilities when using our AI-powered sales platform."
        keywords="OutReign terms of service, terms and conditions, user agreement, service agreement"
        ogImage="https://outreign.io/outreign-social-card.jpg"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://outreign.io" },
        { name: "Terms of Service", url: "https://outreign.io/terms" }
      ]} />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />

        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-14 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-16"
            aria-labelledby="terms-heading"
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
              className="absolute top-[-120px] left-[-100px] h-[400px] w-[400px] rounded-full hero-orb pointer-events-none sm:h-[520px] sm:w-[520px]"
              style={{
                background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.14) 0%, transparent 70%)",
                filter: "blur(40px)",
              }}
              aria-hidden="true"
            />
            <div className="noise-texture" aria-hidden="true" />

            <div className="relative z-10 container mx-auto px-5 sm:px-6 max-w-4xl">
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                Legal
              </span>
              <h1
                id="terms-heading"
                className="font-display text-4xl sm:text-5xl"
                style={{ fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 95%)" }}
              >
                Terms of{" "}
                <span
                  className="font-display italic animate-shiny"
                  style={{
                    backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: "url(#c3-noise)",
                  }}
                >
                  Service
                </span>
              </h1>
            </div>
          </section>

          {/* Content */}
          <div className="container mx-auto px-5 sm:px-6 pb-20 max-w-4xl">
            <article className="space-y-10" style={{ color: bodyColor }}>

              <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                <strong style={{ color: "hsl(0 0% 80%)" }}>Last Updated:</strong>{" "}
                <time dateTime="2025-01">January 2025</time>
              </p>
              <p>
                These Terms of Service ("Terms") govern your access to and use of OutReign, an AI-powered sales operating system operated by BDØT Industries LLC ("Company," "we," "our," or "us").
              </p>

              {[
                {
                  id: "acceptance",
                  title: "Acceptance of Terms",
                  content: (
                    <p>
                      By accessing or using OutReign, you agree to be bound by these Terms. If you do not agree to these Terms, do not use our services.
                    </p>
                  ),
                },
                {
                  id: "use-services",
                  title: "Use of Services",
                  content: (
                    <>
                      <h3 className="text-xl font-semibold mb-3 mt-4" style={{ color: "hsl(0 0% 85%)" }}>Eligibility</h3>
                      <p className="mb-4">
                        You must be at least 18 years old to use OutReign. By using our services, you represent that you meet this age requirement.
                      </p>
                      <h3 className="text-xl font-semibold mb-3 mt-4" style={{ color: "hsl(0 0% 85%)" }}>Account Registration</h3>
                      <p className="mb-4">You must create an account to use certain features. You are responsible for:</p>
                      <ul className="space-y-2 ml-4">
                        {[
                          "Maintaining the confidentiality of your account credentials",
                          "All activities that occur under your account",
                          "Notifying us immediately of any unauthorized use",
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </>
                  ),
                },
                {
                  id: "acceptable-use",
                  title: "Acceptable Use",
                  content: (
                    <>
                      <p className="mb-4">You agree not to:</p>
                      <ul className="space-y-2 ml-4">
                        {[
                          "Use the service for any illegal or unauthorized purpose",
                          "Violate any laws in your jurisdiction",
                          "Interfere with or disrupt the integrity or performance of the service",
                          "Attempt to gain unauthorized access to any portion of the service",
                          "Upload or transmit viruses, malware, or other malicious code",
                          "Harass, abuse, or harm another person or entity",
                          "Impersonate or misrepresent your affiliation with any person or entity",
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </>
                  ),
                },
                {
                  id: "ip",
                  title: "Intellectual Property",
                  content: (
                    <>
                      <p className="mb-4">
                        OutReign and its original content, features, and functionality are owned by BDØT Industries LLC and are protected by international copyright, trademark, and other intellectual property laws.
                      </p>
                      <p>
                        You retain all rights to the data and content you upload to OutReign. By using our service, you grant us a limited license to use, store, and process your content solely to provide our services.
                      </p>
                    </>
                  ),
                },
                {
                  id: "billing",
                  title: "Subscription and Billing",
                  content: (
                    <>
                      <p className="mb-4">Some features of OutReign require a paid subscription. By subscribing, you agree to:</p>
                      <ul className="space-y-2 ml-4 mb-4">
                        {[
                          "Pay all fees associated with your chosen plan",
                          "Provide accurate and complete billing information",
                          "Automatic renewal unless canceled before the renewal date",
                        ].map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <p>We reserve the right to modify our pricing at any time. We will provide notice of price changes.</p>
                    </>
                  ),
                },
                {
                  id: "ai-content",
                  title: "AI-Generated Content",
                  content: (
                    <p>
                      OutReign uses artificial intelligence to generate insights, recommendations, and content. While we strive for accuracy, AI-generated content may contain errors or inaccuracies. You are responsible for reviewing and validating all AI-generated content before use.
                    </p>
                  ),
                },
                {
                  id: "integrations",
                  title: "Third-Party Integrations",
                  content: (
                    <p>
                      OutReign may integrate with third-party services (e.g., Google Calendar, Gmail). Your use of these integrations is subject to the third party's terms of service and privacy policies. We are not responsible for the practices of third-party services.
                    </p>
                  ),
                },
                {
                  id: "disclaimers",
                  title: "Disclaimers and Limitation of Liability",
                  content: (
                    <>
                      <p className="mb-4" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
                        THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
                      </p>
                      <p style={{ color: "hsl(0 0% 100% / 0.5)" }}>
                        TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
                      </p>
                    </>
                  ),
                },
                {
                  id: "termination",
                  title: "Termination",
                  content: (
                    <p>
                      We reserve the right to suspend or terminate your account at any time for violations of these Terms or for any other reason. You may terminate your account at any time by contacting us or using the account settings.
                    </p>
                  ),
                },
                {
                  id: "governing-law",
                  title: "Governing Law",
                  content: (
                    <p>
                      These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.
                    </p>
                  ),
                },
                {
                  id: "changes",
                  title: "Changes to Terms",
                  content: (
                    <p>
                      We reserve the right to modify these Terms at any time. We will notify you of material changes via email or through the platform. Your continued use of the service after changes constitutes acceptance of the new Terms.
                    </p>
                  ),
                },
              ].map(({ id, title, content }) => (
                <section key={id} aria-labelledby={id}>
                  <h2 id={id} className="text-2xl font-semibold mb-4" style={{ color: "hsl(0 0% 90%)", letterSpacing: "-0.01em" }}>
                    {title}
                  </h2>
                  {content}
                </section>
              ))}

              <section aria-labelledby="contact-terms">
                <h2 id="contact-terms" className="text-2xl font-semibold mb-4" style={{ color: "hsl(0 0% 90%)", letterSpacing: "-0.01em" }}>
                  Contact Us
                </h2>
                <address className="not-italic">
                  If you have questions about these Terms, visit our{" "}
                  <a href="/help" className="hover:underline" style={linkStyle}>Help Center</a> or contact us at:
                  <br />
                  <strong style={{ color: "hsl(0 0% 85%)" }}>Email:</strong>{" "}
                  <a href="mailto:support@bdotindustries.com" className="hover:underline" style={linkStyle}>
                    support@bdotindustries.com
                  </a>
                </address>
              </section>

              <nav
                aria-labelledby="related-links"
                className="pt-8"
                style={{ borderTop: "1px solid hsl(261 75% 50% / 0.18)" }}
              >
                <p id="related-links" className="text-[10px] uppercase tracking-[0.25em] mb-4" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                  Related pages
                </p>
                <ul className="grid sm:grid-cols-2 gap-3 text-sm">
                  {[
                    { href: "/privacy", label: "Privacy Policy", sub: "How we handle your data" },
                    { href: "/security", label: "Security Practices", sub: "Our security measures" },
                    { href: "/help", label: "Help Center", sub: "Support and documentation" },
                    { href: "/pricing", label: "Pricing Plans", sub: "View subscription options" },
                  ].map(({ href, label, sub }) => (
                    <li key={href}>
                      <a href={href} className="hover:underline font-medium" style={linkStyle}>{label}</a>
                      <span style={{ color: "hsl(0 0% 100% / 0.55)" }}> – {sub}</span>
                    </li>
                  ))}
                </ul>
              </nav>
            </article>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default Terms;
