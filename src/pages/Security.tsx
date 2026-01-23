import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Shield, Lock, Eye, Server, FileCheck, AlertTriangle } from "lucide-react";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

const Security = () => {
  return (
    <>
      <SEOHead 
        title="Security - SalesOS"
        description="Learn about SalesOS security practices. Enterprise-grade data protection with encryption, SOC 2 compliance, GDPR/CCPA compliance, and 24/7 monitoring."
        keywords="SalesOS security, data encryption, SOC 2, GDPR compliance, enterprise security, data protection"
        canonicalUrl="https://salesos.alephwavex.io/security"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Security", url: "https://salesos.alephwavex.io/security" }
      ]} />
      
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="container mx-auto px-6 py-24">
          <article className="max-w-4xl mx-auto">
            <header>
              <h1 className="text-4xl font-bold mb-4">Security at SalesOS</h1>
              <p className="text-xl text-muted-foreground mb-12">
                Your data security is our top priority. We implement industry-leading security practices to protect your information.
              </p>
            </header>
            
            <div className="space-y-12">
              <section className="space-y-6" aria-labelledby="encryption">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg" aria-hidden="true">
                    <Lock className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="encryption" className="text-2xl font-semibold mb-3">Data Encryption</h2>
                    <p className="text-muted-foreground mb-4">
                      All data transmitted to and from SalesOS is encrypted using industry-standard TLS 1.3 protocol. Data at rest is encrypted using AES-256 encryption.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                      <li>End-to-end encryption for sensitive data</li>
                      <li>Encrypted backups and disaster recovery</li>
                      <li>Secure key management practices</li>
                    </ul>
                  </div>
                </div>
              </section>

              <section className="space-y-6" aria-labelledby="auth-access">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-primary/10 rounded-lg" aria-hidden="true">
                    <Shield className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="auth-access" className="text-2xl font-semibold mb-3">Authentication & Access Control</h2>
                    <p className="text-muted-foreground mb-4">
                      We implement robust authentication mechanisms to ensure only authorized users can access your data.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
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
                  <div className="p-3 bg-primary/10 rounded-lg" aria-hidden="true">
                    <Server className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="infrastructure" className="text-2xl font-semibold mb-3">Infrastructure Security</h2>
                    <p className="text-muted-foreground mb-4">
                      Our infrastructure is built on secure, enterprise-grade cloud services with multiple layers of protection.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
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
                  <div className="p-3 bg-primary/10 rounded-lg" aria-hidden="true">
                    <Eye className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="privacy-protection" className="text-2xl font-semibold mb-3">Privacy & Data Protection</h2>
                    <p className="text-muted-foreground mb-4">
                      We are committed to protecting your privacy and maintaining GDPR and CCPA compliance.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
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
                  <div className="p-3 bg-primary/10 rounded-lg" aria-hidden="true">
                    <FileCheck className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="compliance" className="text-2xl font-semibold mb-3">Compliance & Certifications</h2>
                    <p className="text-muted-foreground mb-4">
                      We adhere to industry standards and maintain compliance with major regulations.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
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
                  <div className="p-3 bg-primary/10 rounded-lg" aria-hidden="true">
                    <AlertTriangle className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h2 id="incident-response" className="text-2xl font-semibold mb-3">Incident Response</h2>
                    <p className="text-muted-foreground mb-4">
                      We have a comprehensive incident response plan to quickly address any security concerns.
                    </p>
                    <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                      <li>24/7 security monitoring and alerting</li>
                      <li>Defined incident response procedures</li>
                      <li>Transparent breach notification policy</li>
                      <li>Regular security drills and training</li>
                    </ul>
                  </div>
                </div>
              </section>

              <aside className="bg-card border border-border rounded-lg p-8 mt-12">
                <h2 className="text-2xl font-semibold mb-4">Responsible Disclosure</h2>
                <p className="text-muted-foreground mb-4">
                  If you discover a security vulnerability, we encourage responsible disclosure. Please report security issues to:
                </p>
                <address className="not-italic mb-4">
                  <strong>Email:</strong> <a href="mailto:support@bdotindustries.com" className="text-primary hover:underline">support@bdotindustries.com</a>
                </address>
                <p className="text-sm text-muted-foreground">
                  We take all security reports seriously and will respond promptly to valid concerns. Please do not publicly disclose issues until we have had a chance to address them.
                </p>
              </aside>

              <section className="mt-12" aria-labelledby="security-questions">
                <h2 id="security-questions" className="text-2xl font-semibold mb-4">Questions?</h2>
                <address className="not-italic text-muted-foreground">
                  For security-related questions, visit our{" "}
                  <a href="/help" className="text-primary hover:underline">Help Center</a>{" "}
                  or contact us at:{" "}
                  <a href="mailto:support@bdotindustries.com" className="text-primary hover:underline">
                    support@bdotindustries.com
                  </a>
                </address>
              </section>
            </div>
          </article>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Security;
