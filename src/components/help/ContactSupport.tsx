import { Mail, Clock, ExternalLink, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";

const accentColor = "hsl(261 75% 65%)";
const cardStyle = {
  background: "hsl(261 75% 50% / 0.04)",
  border: "1px solid hsl(261 75% 50% / 0.14)",
} as const;

const iconWrap = {
  background: "hsl(261 75% 50% / 0.1)",
  border: "1px solid hsl(261 75% 50% / 0.2)",
} as const;

export const ContactSupport = () => {
  return (
    <section className="py-16 sm:py-20" style={{ background: "hsl(261 75% 2%)" }}>
      <div className="container mx-auto px-5 sm:px-6">
        <div className="text-center mb-10 sm:mb-12">
          <p className="mb-3 text-[10px] uppercase tracking-[0.25em]" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
            Support
          </p>
          <h2 className="font-display text-3xl sm:text-4xl mb-3" style={{ fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 92%)" }}>
            Still need help?
          </h2>
          <p className="max-w-xl mx-auto" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
            Can't find what you're looking for? Our support team is here to help.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {/* Email Support */}
          <div
            className="p-6 text-center rounded-2xl transition-all duration-200"
            style={cardStyle}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.14)")}
          >
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4" style={iconWrap}>
              <Mail className="h-5 w-5" style={{ color: accentColor }} />
            </div>
            <h3 className="font-semibold mb-2" style={{ color: "hsl(0 0% 90%)" }}>Email Support</h3>
            <p className="text-sm mb-4" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
              Get help from our support team
            </p>
            <a
              href="mailto:support@bdotindustries.com"
              className="text-sm font-medium hover:underline"
              style={{ color: accentColor }}
            >
              support@bdotindustries.com
            </a>
            <div className="flex items-center justify-center gap-1 mt-3 text-xs" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
              <Clock className="h-3 w-3" />
              Response within 24 hours
            </div>
          </div>

          {/* API Documentation */}
          <div
            className="p-6 text-center rounded-2xl transition-all duration-200"
            style={cardStyle}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.14)")}
          >
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4" style={iconWrap}>
              <ExternalLink className="h-5 w-5" style={{ color: accentColor }} />
            </div>
            <h3 className="font-semibold mb-2" style={{ color: "hsl(0 0% 90%)" }}>API Documentation</h3>
            <p className="text-sm mb-4" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
              Technical docs for developers
            </p>
            <Link
              to="/api-docs"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors"
              style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 85%)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.4)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.2)")}
            >
              View API Docs
            </Link>
          </div>

          {/* Request Feature */}
          <div
            className="p-6 text-center rounded-2xl transition-all duration-200"
            style={cardStyle}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.14)")}
          >
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4" style={iconWrap}>
              <MessageSquare className="h-5 w-5" style={{ color: accentColor }} />
            </div>
            <h3 className="font-semibold mb-2" style={{ color: "hsl(0 0% 90%)" }}>Request feature</h3>
            <p className="text-sm mb-4" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
              Suggest a new integration or feature
            </p>
            <Link
              to="/request-integration"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors"
              style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 85%)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.4)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.2)")}
            >
              Submit Request
            </Link>
          </div>
        </div>

        <div
          className="text-center mt-10 sm:mt-12 p-6 rounded-2xl max-w-2xl mx-auto"
          style={cardStyle}
        >
          <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
            For urgent issues or account-related inquiries, email us at{" "}
            <a
              href="mailto:support@bdotindustries.com"
              className="hover:underline font-medium"
              style={{ color: accentColor }}
            >
              support@bdotindustries.com
            </a>{" "}
            with your account email and a description of the issue.
          </p>
        </div>
      </div>
    </section>
  );
};
