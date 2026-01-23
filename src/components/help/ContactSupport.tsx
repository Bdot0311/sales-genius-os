import { Mail, Clock, MessageSquare, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "react-router-dom";

export const ContactSupport = () => {
  return (
    <section className="py-16 bg-gradient-to-b from-background to-card">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-4">
            Still need help?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Can't find what you're looking for? Our support team is here to help.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {/* Email Support */}
          <Card className="p-6 text-center bg-card border-border hover:border-primary/50 transition-colors">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-4">
              <Mail className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Email Support</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get help from our support team
            </p>
            <a 
              href="mailto:support@bdotindustries.com"
              className="text-primary hover:underline font-medium"
            >
              support@bdotindustries.com
            </a>
            <div className="flex items-center justify-center gap-1 mt-3 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              Response within 24 hours
            </div>
          </Card>

          {/* API Documentation */}
          <Card className="p-6 text-center bg-card border-border hover:border-primary/50 transition-colors">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-4">
              <ExternalLink className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">API Documentation</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Technical docs for developers
            </p>
            <Link to="/api-docs">
              <Button variant="outline" size="sm">
                View API Docs
              </Button>
            </Link>
          </Card>

          {/* Request Integration */}
          <Card className="p-6 text-center bg-card border-border hover:border-primary/50 transition-colors">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-4">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">Request Feature</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Suggest a new integration or feature
            </p>
            <Link to="/request-integration">
              <Button variant="outline" size="sm">
                Submit Request
              </Button>
            </Link>
          </Card>
        </div>

        <div className="text-center mt-12 p-6 bg-card/50 rounded-lg max-w-2xl mx-auto">
          <p className="text-muted-foreground">
            For urgent issues or account-related inquiries, email us at{" "}
            <a 
              href="mailto:support@bdotindustries.com" 
              className="text-primary hover:underline"
            >
              support@bdotindustries.com
            </a>
            {" "}with your account email and a description of the issue.
          </p>
        </div>
      </div>
    </section>
  );
};
