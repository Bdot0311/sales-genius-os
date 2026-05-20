import { Mail, Clock, MessageSquare, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";

export const ContactSupport = () => {
  const cardStyle = {
    background: "hsl(261 75% 50% / 0.04)",
    border: "1px solid hsl(261 75% 50% / 0.14)",
  } as const;

  return (
    <section className="py-16 sm:py-20" style={{ background: "hsl(261 75% 2%)" }}>
      <div className="container mx-auto px-5 sm:px-6">
        <div className="text-center mb-10 sm:mb-12">
          <p className="mb-3 text-[10px] uppercase tracking-[0.25em] text-white/70">
            Support
          </p>
          <h2 className="font-display text-3xl sm:text-4xl mb-3 text-white">
            Still need help?
          </h2>
          <p className="text-white/55 max-w-xl mx-auto">
            Can't find what you're looking for? Our support team is here to help.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          {/* Email Support */}
          <Card
            className="p-6 text-center transition-colors hover:border-primary/40"
            style={cardStyle}
          >
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary mb-4 ring-1 ring-primary/20">
              <Mail className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-white mb-2">Email Support</h3>
            <p className="text-sm text-white/55 mb-4">
              Get help from our support team
            </p>
            <a
              href="mailto:support@bdotindustries.com"
              className="text-primary hover:underline font-medium text-sm"
            >
              support@bdotindustries.com
            </a>
            <div className="flex items-center justify-center gap-1 mt-3 text-xs text-white/75">
              <Clock className="h-3 w-3" />
              Response within 24 hours
            </div>
          </Card>

          {/* API Documentation */}
          <Card
            className="p-6 text-center transition-colors hover:border-primary/40"
            style={cardStyle}
          >
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary mb-4 ring-1 ring-primary/20">
              <ExternalLink className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-white mb-2">API Documentation</h3>
            <p className="text-sm text-white/55 mb-4">
              Technical docs for developers
            </p>
            <Link to="/api-docs">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
              >
                View API Docs
              </Button>
            </Link>
          </Card>

          {/* Request Integration */}
          <Card
            className="p-6 text-center transition-colors hover:border-primary/40"
            style={cardStyle}
          >
            <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-primary/10 text-primary mb-4 ring-1 ring-primary/20">
              <MessageSquare className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-white mb-2">Request feature</h3>
            <p className="text-sm text-white/55 mb-4">
              Suggest a new integration or feature
            </p>
            <Link to="/request-integration">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
              >
                Submit Request
              </Button>
            </Link>
          </Card>
        </div>

        <div
          className="text-center mt-10 sm:mt-12 p-6 rounded-2xl max-w-2xl mx-auto"
          style={{
            background: "hsl(261 75% 50% / 0.04)",
            border: "1px solid hsl(261 75% 50% / 0.14)",
          }}
        >
          <p className="text-sm text-white/55">
            For urgent issues or account-related inquiries, email us at{" "}
            <a
              href="mailto:support@bdotindustries.com"
              className="text-primary hover:underline"
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
