import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useEffect } from "react";

const Privacy = () => {
  useEffect(() => {
    document.title = "Privacy Policy - SalesOS";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute("content", "SalesOS privacy policy - Learn how we collect, use, and protect your data.");
    }
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="container mx-auto px-6 py-24 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        
        <div className="prose prose-lg max-w-none space-y-8">
          <section>
            <p className="text-muted-foreground mb-6">
              <strong>Last Updated:</strong> January 2025
            </p>
            <p>
              This Privacy Policy describes how SalesOS ("we," "our," or "us") collects, uses, and shares your personal information when you use our AI-powered sales operating system.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Information We Collect</h2>
            <p className="mb-4">We collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account Information:</strong> Name, email address, and password when you create an account</li>
              <li><strong>Usage Data:</strong> Information about how you interact with our platform, including features used and actions taken</li>
              <li><strong>Lead and Contact Data:</strong> Information you input about your sales leads and contacts</li>
              <li><strong>Integration Data:</strong> Data from third-party services you connect (e.g., Google Calendar, Gmail)</li>
              <li><strong>Device and Technical Information:</strong> IP address, browser type, device type, and operating system</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">How We Use Your Information</h2>
            <p className="mb-4">We use your information to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide and improve our AI-powered sales platform</li>
              <li>Generate personalized AI insights and recommendations</li>
              <li>Send you important updates about your account and our services</li>
              <li>Analyze usage patterns to enhance user experience</li>
              <li>Comply with legal obligations and enforce our terms</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your data, including encryption in transit and at rest, secure authentication, and regular security audits. However, no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Third-Party Services</h2>
            <p className="mb-4">
              We integrate with third-party services to enhance functionality. When you connect these services, their respective privacy policies apply:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Google Calendar and Gmail (Google Privacy Policy)</li>
              <li>Other integrations as you authorize them</li>
            </ul>
            <p className="mt-4">
              We do not transfer or disclose your information to third parties for purposes other than the ones provided.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Your Rights</h2>
            <p className="mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access, update, or delete your personal information</li>
              <li>Export your data in a portable format</li>
              <li>Opt-out of marketing communications</li>
              <li>Request deletion of your account and associated data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Data Retention</h2>
            <p>
              We retain your data for as long as your account is active or as needed to provide services. Upon account deletion, we will delete or anonymize your data within 30 days, except where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Children's Privacy</h2>
            <p>
              Our services are not intended for individuals under the age of 18. We do not knowingly collect personal information from children.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of significant changes by email or through our platform.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy, please contact us at:
              <br />
              <strong>Email:</strong> support@alephwave.io
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
