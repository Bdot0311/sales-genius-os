import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Shield, Lock, Eye, Server, FileCheck, AlertTriangle } from "lucide-react";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

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
      
      <div
        className="min-h-screen text-foreground overflow-x-hidden"
        style={{ background: "hsl(261 75% 2%)" }}
      >
        <Navbar />
        <main className="container mx-auto px-5 sm:px-6 pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-20">
          <article className="max-w-4xl mx-auto">
            <header className="mb-12">
              <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm sm:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                Trust & Security
              </span>
              <h1 className="font-display text-4xl sm:text-5xl mb-4">
                Security at{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 70% 70%) 100%)",
                  }}
                >
                  SalesOS
                </span>
              </h1>
              <p className="text-lg text-white/60 max-w-2xl">
                Your data security is our top priority. We implement industry-leading security practices to protect your information.
              </p>
            </header>
            
            <div className="space-y-12">
              <section className="space-y-6" aria-labelledby="encryption">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl ring-1 ring-primary/20 shrink-0" aria-hidden="true">
                    <Lock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="encryption" className="text-2xl font-semibold mb-3">Data Encryption</h2>
                    <p className="text-white/60 mb-4">
                      All data transmitted to and from SalesOS is encrypted using industry-standard TLS 1.3 protocol. Data at rest is encrypted using AES-256 encryption.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-white/60 marker:text-primary/50">
                      <li>End-to-end encryption for sensitive data</li>
                      <li>Encrypted backups and disaster recovery</li>
                      <li>Secure key management practices</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-6" aria-labelledby="auth-access">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl ring-1 ring-primary/20 shrink-0" aria-hidden="true">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="auth-access" className="text-2xl font-semibold mb-3">Authentication & Access Control</h2>
                    <p className="text-white/60 mb-4">
                      We implement robust authentication mechanisms to ensure only authorized users can access your data.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-white/60 marker:text-primary/50">
                      <li>Secure password hashing using bcrypt</li>
                      <li>Multi-factor authentication (MFA) support</li>
                      <li>OAuth 2.0 integration for third-party services</li>
                      <li>Role-based access control (RBAC)</li>
                      <li>Session management with secure tokens</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-6" aria-labelledby="infrastructure">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl ring-1 ring-primary/20 shrink-0" aria-hidden="true">
                    <Server className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="infrastructure" className="text-2xl font-semibold mb-3">Infrastructure Security</h2>
                    <p className="text-white/60 mb-4">
                      Our infrastructure is built on secure, enterprise-grade cloud services with multiple layers of protection.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-white/60 marker:text-primary/50">
                      <li>Regular security audits and penetration testing</li>
                      <li>Automated vulnerability scanning</li>
                      <li>DDoS protection and rate limiting</li>
                      <li>Isolated database environments</li>
                      <li>24/7 infrastructure monitoring</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-6" aria-labelledby="privacy-protection">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl ring-1 ring-primary/20 shrink-0" aria-hidden="true">
                    <Eye className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="privacy-protection" className="text-2xl font-semibold mb-3">Privacy & Data Protection</h2>
                    <p className="text-white/60 mb-4">
                      We are committed to protecting your privacy and maintaining GDPR and CCPA compliance.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-white/60 marker:text-primary/50">
                      <li>Data minimization - we only collect what we need</li>
                      <li>Right to access, export, and delete your data</li>
                      <li>Regular privacy impact assessments</li>
                      <li>Transparent data processing practices</li>
                      <li>No selling of personal information to third parties</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-6" aria-labelledby="compliance">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl ring-1 ring-primary/20 shrink-0" aria-hidden="true">
                    <FileCheck className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="compliance" className="text-2xl font-semibold mb-3">Compliance & Certifications</h2>
                    <p className="text-white/60 mb-4">
                      We adhere to industry standards and maintain compliance with major regulations.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-white/60 marker:text-primary/50">
                      <li>GDPR (General Data Protection Regulation) compliant</li>
                      <li>CCPA (California Consumer Privacy Act) compliant</li>
                      <li>SOC 2 Type II in progress</li>
                      <li>Regular third-party security assessments</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-6" aria-labelledby="incident-response">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-xl ring-1 ring-primary/20 shrink-0" aria-hidden="true">
                    <AlertTriangle className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="incident-response" className="text-2xl font-semibold mb-3">Incident Response</h2>
                    <p className="text-white/60 mb-4">
                      We have a comprehensive incident response plan to quickly address any security concerns.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-white/60 marker:text-primary/50">
                      <li>24/7 security monitoring and alerting</li>
                      <li>Defined incident response procedures</li>
                      <li>Transparent breach notification policy</li>
                      <li>Regular security drills and training</li>
                    </ul>
                  </div>
                </div>
              </section>

              <aside
                className="rounded-2xl p-8 mt-12"
                style={{
                  background: "hsl(261 75% 50% / 0.04)",
                  border: "1px solid hsl(261 75% 50% / 0.14)",
                }}
              >
                <h2 className="text-2xl font-semibold mb-4">Responsible disclosure</h2>
                <p className="text-white/60 mb-4">
                  If you discover a security vulnerability, we encourage responsible disclosure. Please report security issues to:
                </p>
                <address className="not-italic mb-4">
                  <strong className="text-white/80">Email:</strong>{" "}
                  <a href="mailto:support@bdotindustries.com" className="text-primary hover:underline">
                    support@bdotindustries.com
                  </a>
                </address>
                <p className="text-sm text-white/55">
                  We take all security reports seriously and will respond promptly to valid concerns. Please do not publicly disclose issues until we have had a chance to address them.
                </p>
              </aside>

              <section className="mt-12" aria-labelledby="security-questions">
                <h2 id="security-questions" className="text-2xl font-semibold mb-4">Questions?</h2>
                <address className="not-italic text-white/60">
                  For security-related questions, visit our{" "}
                  <a href="/help" className="text-primary hover:underline">Help Center</a>{" "}
                  or contact us at:{" "}
                  <a href="mailto:support@bdotindustries.com" className="text-primary hover:underline">
                    support@bdotindustries.com
                  </a>
                </address>
              </section>

              <nav
                aria-labelledby="related-links"
                className="mt-12 pt-8 border-t"
                style={{ borderColor: "hsl(261 75% 50% / 0.18)" }}
              >
                <h2 id="related-links" className="text-xl font-semibold mb-4">Related pages</h2>
                <ul className="grid sm:grid-cols-2 gap-3">
                  <li>
                    <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>
                    <span className="text-white/55"> – Data protection details</span>
                  </li>
                  <li>
                    <a href="/terms" className="text-primary hover:underline">Terms of Service</a>
                    <span className="text-white/55"> – User agreement</span>
                  </li>
                  <li>
                    <a href="/api-docs" className="text-primary hover:underline">API Documentation</a>
                    <span className="text-white/55"> – Developer integration guide</span>
                  </li>
                  <li>
                    <a href="/api-status" className="text-primary hover:underline">System Status</a>
                    <span className="text-white/55"> – Real-time uptime monitoring</span>
                  </li>
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
