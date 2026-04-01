import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { SEOHead, BreadcrumbSchema } from "@/components/seo";

const Terms = () => {
  return (
    <>
      <SEOHead 
        title="Terms of Service - User Agreement & Policies | SalesOS"
        description="Review the SalesOS Terms of Service. Understand your rights and responsibilities when using our AI-powered sales platform."
        keywords="SalesOS terms of service, terms and conditions, user agreement, service agreement"
        ogImage="https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/social-images/social-1768238149761-SalesOS full logo.png"
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Terms of Service", url: "https://salesos.alephwavex.io/terms" }
      ]} />
      
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="container mx-auto px-6 py-24 max-w-4xl">
          <article>
            <header>
              <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
            </header>
            
            <div className="prose prose-lg max-w-none space-y-8">
              <section>
                <p className="text-muted-foreground mb-6">
                  <strong>Last Updated:</strong> <time dateTime="2025-01">January 2025</time>
                </p>
                <p>
                  These Terms of Service ("Terms") govern your access to and use of SalesOS, an AI-powered sales operating system operated by BDØT Industries LLC ("Company," "we," "our," or "us").
                </p>
              </section>

              <section aria-labelledby="acceptance">
                <h2 id="acceptance" className="text-2xl font-semibold mb-4">Acceptance of Terms</h2>
                <p>
                  By accessing or using SalesOS, you agree to be bound by these Terms. If you do not agree to these Terms, do not use our services.
                </p>
              </section>

              <section aria-labelledby="use-services">
                <h2 id="use-services" className="text-2xl font-semibold mb-4">Use of Services</h2>
                <h3 className="text-xl font-semibold mb-3 mt-4">Eligibility</h3>
                <p className="mb-4">
                  You must be at least 18 years old to use SalesOS. By using our services, you represent that you meet this age requirement.
                </p>
                
                <h3 className="text-xl font-semibold mb-3 mt-4">Account Registration</h3>
                <p className="mb-4">
                  You must create an account to use certain features. You are responsible for:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Maintaining the confidentiality of your account credentials</li>
                  <li>All activities that occur under your account</li>
                  <li>Notifying us immediately of any unauthorized use</li>
                </ul>
              </section>

              <section aria-labelledby="acceptable-use">
                <h2 id="acceptable-use" className="text-2xl font-semibold mb-4">Acceptable Use</h2>
                <p className="mb-4">You agree not to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Use the service for any illegal or unauthorized purpose</li>
                  <li>Violate any laws in your jurisdiction</li>
                  <li>Interfere with or disrupt the integrity or performance of the service</li>
                  <li>Attempt to gain unauthorized access to any portion of the service</li>
                  <li>Upload or transmit viruses, malware, or other malicious code</li>
                  <li>Harass, abuse, or harm another person or entity</li>
                  <li>Impersonate or misrepresent your affiliation with any person or entity</li>
                </ul>
              </section>

              <section aria-labelledby="ip">
                <h2 id="ip" className="text-2xl font-semibold mb-4">Intellectual Property</h2>
                <p className="mb-4">
                  SalesOS and its original content, features, and functionality are owned by BDØT Industries LLC and are protected by international copyright, trademark, and other intellectual property laws.
                </p>
                <p>
                  You retain all rights to the data and content you upload to SalesOS. By using our service, you grant us a limited license to use, store, and process your content solely to provide our services.
                </p>
              </section>

              <section aria-labelledby="billing">
                <h2 id="billing" className="text-2xl font-semibold mb-4">Subscription and Billing</h2>
                <p className="mb-4">
                  Some features of SalesOS require a paid subscription. By subscribing, you agree to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Pay all fees associated with your chosen plan</li>
                  <li>Provide accurate and complete billing information</li>
                  <li>Automatic renewal unless canceled before the renewal date</li>
                </ul>
                <p className="mt-4">
                  We reserve the right to modify our pricing at any time. We will provide notice of price changes.
                </p>
              </section>

              <section aria-labelledby="ai-content">
                <h2 id="ai-content" className="text-2xl font-semibold mb-4">AI-Generated Content</h2>
                <p>
                  SalesOS uses artificial intelligence to generate insights, recommendations, and content. While we strive for accuracy, AI-generated content may contain errors or inaccuracies. You are responsible for reviewing and validating all AI-generated content before use.
                </p>
              </section>

              <section aria-labelledby="integrations">
                <h2 id="integrations" className="text-2xl font-semibold mb-4">Third-Party Integrations</h2>
                <p>
                  SalesOS may integrate with third-party services (e.g., Google Calendar, Gmail). Your use of these integrations is subject to the third party's terms of service and privacy policies. We are not responsible for the practices of third-party services.
                </p>
              </section>

              <section aria-labelledby="disclaimers">
                <h2 id="disclaimers" className="text-2xl font-semibold mb-4">Disclaimers and Limitation of Liability</h2>
                <p className="mb-4">
                  THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
                </p>
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
                </p>
              </section>

              <section aria-labelledby="termination">
                <h2 id="termination" className="text-2xl font-semibold mb-4">Termination</h2>
                <p>
                  We reserve the right to suspend or terminate your account at any time for violations of these Terms or for any other reason. You may terminate your account at any time by contacting us or using the account settings.
                </p>
              </section>

              <section aria-labelledby="governing-law">
                <h2 id="governing-law" className="text-2xl font-semibold mb-4">Governing Law</h2>
                <p>
                  These Terms shall be governed by and construed in accordance with the laws of the United States, without regard to its conflict of law provisions.
                </p>
              </section>

              <section aria-labelledby="changes">
                <h2 id="changes" className="text-2xl font-semibold mb-4">Changes to Terms</h2>
                <p>
                  We reserve the right to modify these Terms at any time. We will notify you of material changes via email or through the platform. Your continued use of the service after changes constitutes acceptance of the new Terms.
                </p>
              </section>

              <section aria-labelledby="contact-terms">
                <h2 id="contact-terms" className="text-2xl font-semibold mb-4">Contact Us</h2>
                <address className="not-italic">
                  If you have questions about these Terms, visit our{" "}
                  <a href="/help" className="text-primary hover:underline">Help Center</a> or contact us at:
                  <br />
                  <strong>Email:</strong> <a href="mailto:support@bdotindustries.com" className="text-primary hover:underline">support@bdotindustries.com</a>
                </address>
              </section>

              <nav aria-labelledby="related-links" className="mt-12 pt-8 border-t border-border">
                <h2 id="related-links" className="text-xl font-semibold mb-4">Related Pages</h2>
                <ul className="grid sm:grid-cols-2 gap-3">
                  <li>
                    <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>
                    <span className="text-muted-foreground"> – How we handle your data</span>
                  </li>
                  <li>
                    <a href="/security" className="text-primary hover:underline">Security Practices</a>
                    <span className="text-muted-foreground"> – Our security measures</span>
                  </li>
                  <li>
                    <a href="/help" className="text-primary hover:underline">Help Center</a>
                    <span className="text-muted-foreground"> – Support and documentation</span>
                  </li>
                  <li>
                    <a href="/pricing" className="text-primary hover:underline">Pricing Plans</a>
                    <span className="text-muted-foreground"> – View subscription options</span>
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

export default Terms;
