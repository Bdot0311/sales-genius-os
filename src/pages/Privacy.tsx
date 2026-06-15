import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

const linkStyle = { color: "hsl(261 75% 65%)" } as const;
const bodyColor = "hsl(0 0% 100% / 0.6)";

const Privacy = () => {
  return (
    <>
      <SEOHead
        title="Privacy Policy - Data Protection & GDPR Compliance | OutReign"
        description="Learn how OutReign collects, uses, and protects your personal data. We're committed to transparency and GDPR/CCPA compliance."
        keywords="OutReign privacy policy, data protection, GDPR compliance, CCPA compliance, personal data"
        ogImage="https://outreign.io/outreign-social-card.jpg"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://outreign.io" },
        { name: "Privacy Policy", url: "https://outreign.io/privacy" }
      ]} />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />

        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-14 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-16"
            aria-labelledby="privacy-heading"
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
                id="privacy-heading"
                className="font-display text-4xl sm:text-5xl"
                style={{ fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 95%)" }}
              >
                Privacy{" "}
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
                  Policy
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
                This Privacy Policy describes how OutReign ("we," "our," or "us") collects, uses, and shares your personal information when you use our AI-powered sales operating system.
              </p>

              {[
                {
                  id: "info-collect",
                  title: "Information We Collect",
                  content: (
                    <>
                      <p className="mb-4">We collect the following types of information:</p>
                      <ul className="space-y-2 ml-4">
                        {[
                          <><strong style={{ color: "hsl(0 0% 85%)" }}>Account Information:</strong> Name, email address, and password when you create an account</>,
                          <><strong style={{ color: "hsl(0 0% 85%)" }}>Usage Data:</strong> Information about how you interact with our platform, including features used and actions taken</>,
                          <><strong style={{ color: "hsl(0 0% 85%)" }}>Lead and Contact Data:</strong> Information you input about your sales leads and contacts</>,
                          <><strong style={{ color: "hsl(0 0% 85%)" }}>Integration Data:</strong> Data from third-party services you connect (e.g., Google Calendar, Gmail)</>,
                          <><strong style={{ color: "hsl(0 0% 85%)" }}>Device and Technical Information:</strong> IP address, browser type, device type, and operating system</>,
                        ].map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ),
                },
                {
                  id: "info-use",
                  title: "How We Use Your Information",
                  content: (
                    <>
                      <p className="mb-4">We use your information to:</p>
                      <ul className="space-y-2 ml-4">
                        {[
                          "Provide and improve our AI-powered sales platform",
                          "Generate personalized AI insights and recommendations",
                          "Send you important updates about your account and our services",
                          "Analyze usage patterns to enhance user experience",
                          "Comply with legal obligations and enforce our terms",
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
                  id: "data-security",
                  title: "Data Security",
                  content: (
                    <p>
                      We implement industry-standard security measures to protect your data, including encryption in transit and at rest, secure authentication, and regular security audits. However, no method of transmission over the internet is 100% secure.
                    </p>
                  ),
                },
                {
                  id: "third-party",
                  title: "Third-Party Services",
                  content: (
                    <>
                      <p className="mb-4">
                        We integrate with third-party services to enhance functionality. When you connect these services, their respective privacy policies apply:
                      </p>
                      <ul className="space-y-2 ml-4 mb-4">
                        {["Google Calendar and Gmail (Google Privacy Policy)", "Other integrations as you authorize them"].map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <p>We do not transfer or disclose your information to third parties for purposes other than the ones provided.</p>
                    </>
                  ),
                },
                {
                  id: "gmail-data-use",
                  title: "Google User Data & Gmail API Usage",
                  content: (
                    <>
                      <p className="mb-4">
                        OutReign integrates with Google Gmail to enable email outreach features. This section details exactly what Gmail data we access, how we use it, and the safeguards in place.
                      </p>
                      <h3 className="text-sm font-semibold mb-2 mt-4" style={{ color: "hsl(0 0% 85%)" }}>What Gmail data we access</h3>
                      <ul className="space-y-2 ml-4 mb-4">
                        {[
                          <><strong style={{ color: "hsl(0 0% 85%)" }}>Send emails:</strong> We access your Gmail account to send outbound emails composed through OutReign on your behalf</>,
                          <><strong style={{ color: "hsl(0 0% 85%)" }}>Read replies:</strong> We detect and read replies to your sent emails to track response status and update campaign analytics</>,
                          <><strong style={{ color: "hsl(0 0% 85%)" }}>Thread data:</strong> We access email thread metadata (subject lines, timestamps, participants) to associate replies with the correct outreach sequence</>,
                          <><strong style={{ color: "hsl(0 0% 85%)" }}>Label data:</strong> We may read or apply Gmail labels (e.g., marking sent items) for organizational purposes</>,
                        ].map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      <h3 className="text-sm font-semibold mb-2 mt-4" style={{ color: "hsl(0 0% 85%)" }}>How we use Gmail data</h3>
                      <p className="mb-4">
                        Gmail data is used exclusively to power OutReign's outbound email features:
                      </p>
                      <ul className="space-y-2 ml-4 mb-4">
                        {[
                          "Send personalized outbound emails from your connected Gmail account",
                          "Track reply rates and engagement metrics for your outreach campaigns",
                          "Detect open events via embedded tracking pixels (1x1 transparent GIFs) in sent emails",
                          "Update campaign status (e.g., mark as 'replied' or 'bounced') based on thread activity",
                          "Sync sent email status back to your OutReign dashboard in real time",
                        ].map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      <h3 className="text-sm font-semibold mb-2 mt-4" style={{ color: "hsl(0 0% 85%)" }}>Data sharing and retention</h3>
                      <p className="mb-4">
                        We do not share Gmail data with any third parties beyond what is necessary to deliver the service. Gmail data is not used for advertising, is not sold to data brokers, and is not used to train general-purpose AI models. We retain Gmail thread metadata only for as long as your account is active and you maintain the Gmail connection. Upon disconnecting Gmail or deleting your account, thread metadata is removed within 30 days. Raw email content is never permanently stored — only aggregated campaign statistics (reply count, open rate) are retained for reporting.
                      </p>
                      <h3 className="text-sm font-semibold mb-2 mt-4" style={{ color: "hsl(0 0% 85%)" }}>Google Limited Use compliance</h3>
                      <p className="mb-4">
                        Our use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline" style={linkStyle}>Google API Services User Data Policy</a>, including the Limited Use requirements. Specifically:
                      </p>
                      <ul className="space-y-2 ml-4 mb-4">
                        {[
                          "We do not use Gmail data to serve advertisements",
                          "We do not sell Gmail data to third parties",
                          "We do not use Gmail data to train or improve general-purpose AI/ML models outside your account",
                          "No human reads your emails — all processing is automated and scoped to your account only",
                          "We only access the minimum Gmail scopes required for the stated functionality",
                        ].map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                      <h3 className="text-sm font-semibold mb-2 mt-4" style={{ color: "hsl(0 0% 85%)" }}>Revoking access</h3>
                      <p>
                        You can revoke OutReign's access to your Gmail data at any time by visiting your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline" style={linkStyle}>Google Account permissions</a> and removing OutReign, or by disconnecting the Gmail integration in your OutReign account settings. Revocation takes effect immediately and OutReign will no longer be able to access your Gmail data.
                      </p>
                    </>
                  ),
                },
                {
                  id: "your-rights",
                  title: "Your Rights",
                  content: (
                    <>
                      <p className="mb-4">You have the right to:</p>
                      <ul className="space-y-2 ml-4">
                        {[
                          "Access, update, or delete your personal information",
                          "Export your data in a portable format",
                          "Opt-out of marketing communications",
                          "Request deletion of your account and associated data",
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
                  id: "data-retention",
                  title: "Data Retention",
                  content: (
                    <p>
                      We retain your data for as long as your account is active or as needed to provide services. Upon account deletion, we will delete or anonymize your data within 30 days, except where required by law.
                    </p>
                  ),
                },
                {
                  id: "children-privacy",
                  title: "Children's Privacy",
                  content: (
                    <p>
                      Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children.
                    </p>
                  ),
                },
                {
                  id: "policy-changes",
                  title: "Changes to This Policy",
                  content: (
                    <p>
                      We may update this Privacy Policy from time to time. We will notify you of significant changes by email or through our platform.
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

              <section aria-labelledby="contact-privacy">
                <h2 id="contact-privacy" className="text-2xl font-semibold mb-4" style={{ color: "hsl(0 0% 90%)", letterSpacing: "-0.01em" }}>
                  Contact Us
                </h2>
                <address className="not-italic">
                  If you have questions about this Privacy Policy, visit our{" "}
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
                    { href: "/terms", label: "Terms of Service", sub: "Review our user agreement" },
                    { href: "/security", label: "Security Practices", sub: "How we protect your data" },
                    { href: "/help", label: "Help Center", sub: "Get answers to your questions" },
                    { href: "/pricing", label: "Pricing Plans", sub: "View our subscription options" },
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

export default Privacy;
