import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Shield, Lock, Eye, Server, FileCheck, AlertTriangle } from "lucide-react";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

const iconWrap = {
  background: "hsl(261 75% 50% / 0.1)",
  border: "1px solid hsl(261 75% 50% / 0.2)",
} as const;

const Security = () => {
  return (
    <>
      <SEOHead
        title="Security Practices & Data Protection - Enterprise Grade | SalesOS"
        description="Learn about SalesOS security practices. Enterprise-grade data protection with encryption, SOC 2 compliance, GDPR/CCPA compliance, and 24/7 monitoring."
        keywords="SalesOS security, data encryption, SOC 2, GDPR compliance, enterprise security, data protection"
        ogImage="https://salesos.alephwavex.io/salesos-og.png"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Security", url: "https://salesos.alephwavex.io/security" }
      ]} />

      <div className="min-h-screen overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />

        <main>
          {/* Hero */}
          <section
            className="relative overflow-hidden pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-14 sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-20"
            aria-labelledby="security-heading"
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
                background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.16) 0%, hsl(261 75% 55% / 0.04) 50%, transparent 70%)",
                filter: "blur(40px)",
              }}
              aria-hidden="true"
            />
            <div
              className="absolute top-[-80px] right-[-120px] h-[380px] w-[380px] rounded-full hero-orb pointer-events-none sm:h-[500px] sm:w-[500px]"
              style={{
                background: "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.12) 0%, transparent 70%)",
                filter: "blur(50px)",
                animationDelay: "6s",
              }}
              aria-hidden="true"
            />
            <div className="noise-texture" aria-hidden="true" />

            <div className="relative z-10 container mx-auto px-5 sm:px-6 max-w-4xl">
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                Trust &amp; Security
              </span>
              <h1
                id="security-heading"
                className="font-display text-4xl sm:text-5xl mb-4"
                style={{ fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 95%)" }}
              >
                Security at{" "}
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
                  SalesOS
                </span>
              </h1>
              <p className="text-lg max-w-2xl" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                Your data security is our top priority. We implement industry-leading security practices to protect your information.
              </p>
            </div>
          </section>

          {/* Content */}
          <article className="container mx-auto px-5 sm:px-6 pb-20 max-w-4xl">
            <div className="space-y-12">

              {[
                {
                  Icon: Lock,
                  id: "encryption",
                  title: "Data Encryption",
                  body: "All data transmitted to and from SalesOS is encrypted using industry-standard TLS 1.3 protocol. Data at rest is encrypted using AES-256 encryption.",
                  items: ["End-to-end encryption for sensitive data", "Encrypted backups and disaster recovery", "Secure key management practices"],
                },
                {
                  Icon: Shield,
                  id: "auth-access",
                  title: "Authentication & Access Control",
                  body: "We implement robust authentication mechanisms to ensure only authorized users can access your data.",
                  items: ["Secure password hashing using bcrypt", "Multi-factor authentication (MFA) support", "OAuth 2.0 integration for third-party services", "Role-based access control (RBAC)", "Session management with secure tokens"],
                },
                {
                  Icon: Server,
                  id: "infrastructure",
                  title: "Infrastructure Security",
                  body: "Our infrastructure is built on secure, enterprise-grade cloud services with multiple layers of protection.",
                  items: ["Regular security audits and penetration testing", "Automated vulnerability scanning", "DDoS protection and rate limiting", "Isolated database environments", "24/7 infrastructure monitoring"],
                },
                {
                  Icon: Eye,
                  id: "privacy-protection",
                  title: "Privacy & Data Protection",
                  body: "We are committed to protecting your privacy and maintaining GDPR and CCPA compliance.",
                  items: ["Data minimization — we only collect what we need", "Right to access, export, and delete your data", "Regular privacy impact assessments", "Transparent data processing practices", "No selling of personal information to third parties"],
                },
                {
                  Icon: FileCheck,
                  id: "compliance",
                  title: "Compliance & Certifications",
                  body: "We adhere to industry standards and maintain compliance with major regulations.",
                  items: ["GDPR (General Data Protection Regulation) compliant", "CCPA (California Consumer Privacy Act) compliant", "SOC 2 Type II in progress", "Regular third-party security assessments"],
                },
                {
                  Icon: AlertTriangle,
                  id: "incident-response",
                  title: "Incident Response",
                  body: "We have a comprehensive incident response plan to quickly address any security concerns.",
                  items: ["24/7 security monitoring and alerting", "Defined incident response procedures", "Transparent breach notification policy", "Regular security drills and training"],
                },
              ].map(({ Icon, id, title, body, items }) => (
                <section key={id} className="space-y-4" aria-labelledby={id}>
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl shrink-0" style={iconWrap}>
                      <Icon className="w-6 h-6" style={{ color: "hsl(261 75% 65%)" }} />
                    </div>
                    <div>
                      <h2 id={id} className="text-2xl font-semibold mb-3" style={{ color: "hsl(0 0% 90%)", letterSpacing: "-0.01em" }}>
                        {title}
                      </h2>
                      <p className="mb-4" style={{ color: "hsl(0 0% 100% / 0.6)" }}>{body}</p>
                      <ul className="space-y-2">
                        {items.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "hsl(261 75% 55% / 0.6)" }} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              ))}

              <aside
                className="rounded-2xl p-8 mt-12"
                style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" }}
              >
                <h2 className="text-2xl font-semibold mb-4" style={{ color: "hsl(0 0% 90%)" }}>Responsible disclosure</h2>
                <p className="mb-4" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                  If you discover a security vulnerability, we encourage responsible disclosure. Please report security issues to:
                </p>
                <address className="not-italic mb-4" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                  <strong style={{ color: "hsl(0 0% 85%)" }}>Email:</strong>{" "}
                  <a href="mailto:support@bdotindustries.com" className="hover:underline" style={{ color: "hsl(261 75% 65%)" }}>
                    support@bdotindustries.com
                  </a>
                </address>
                <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
                  We take all security reports seriously and will respond promptly to valid concerns. Please do not publicly disclose issues until we have had a chance to address them.
                </p>
              </aside>

              <section className="mt-12" aria-labelledby="security-questions">
                <h2 id="security-questions" className="text-2xl font-semibold mb-4" style={{ color: "hsl(0 0% 90%)" }}>Questions?</h2>
                <address className="not-italic" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                  For security-related questions, visit our{" "}
                  <a href="/help" className="hover:underline" style={{ color: "hsl(261 75% 65%)" }}>Help Center</a>{" "}
                  or contact us at:{" "}
                  <a href="mailto:support@bdotindustries.com" className="hover:underline" style={{ color: "hsl(261 75% 65%)" }}>
                    support@bdotindustries.com
                  </a>
                </address>
              </section>

              <nav
                aria-labelledby="related-links"
                className="mt-12 pt-8"
                style={{ borderTop: "1px solid hsl(261 75% 50% / 0.18)" }}
              >
                <p id="related-links" className="text-[10px] uppercase tracking-[0.25em] mb-4" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                  Related pages
                </p>
                <ul className="grid sm:grid-cols-2 gap-3 text-sm">
                  {[
                    { href: "/privacy", label: "Privacy Policy", sub: "Data protection details" },
                    { href: "/terms", label: "Terms of Service", sub: "User agreement" },
                    { href: "/api-docs", label: "API Documentation", sub: "Developer integration guide" },
                    { href: "/api-status", label: "System Status", sub: "Real-time uptime monitoring" },
                  ].map(({ href, label, sub }) => (
                    <li key={href}>
                      <a href={href} className="hover:underline font-medium" style={{ color: "hsl(261 75% 65%)" }}>{label}</a>
                      <span style={{ color: "hsl(0 0% 100% / 0.55)" }}> – {sub}</span>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </article>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default Security;
