import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQSchema } from "@/components/seo";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const faqs = [
  {
    question: "What's included in the free trial?",
    answer: "You get 14 days to try any SalesOS plan with full access to the features included in that plan. This includes AI lead discovery, email generation, pipeline management, and integrations based on your chosen tier. A credit card is required to start. Cancel anytime before the trial ends and you won't be charged."
  },
  {
    question: "How do search credits work?",
    answer: "Search credits are used when you run AI lead discovery queries. Each search costs 1 credit and returns up to 100 matching leads. Viewing, enriching, and exporting those leads is free. Credits reset monthly based on your plan, and unused credits don't roll over."
  },
  {
    question: "Can I change plans later?",
    answer: "Yes, you can upgrade or downgrade your plan at any time from your account settings. Upgrades take effect immediately with prorated billing. Downgrades apply at the start of your next billing cycle, and you'll keep access to premium features until then."
  },
  {
    question: "How does AI email generation work?",
    answer: "Our AI analyzes each lead's profile, job title, company data, and recent activity to craft personalized outreach. You set the tone (professional, casual, direct) and the AI generates subject lines and body copy. You can edit before sending, and the system learns from your edits over time."
  },
  {
    question: "What integrations are available?",
    answer: "SalesOS connects natively with Google Workspace (Gmail, Calendar, Drive), Slack, Calendly, HubSpot, and Salesforce. We also support 5,000+ apps through Zapier. New integrations are added regularly based on customer requests—you can submit requests from your dashboard."
  },
  {
    question: "Is my data secure?",
    answer: "Absolutely. We use enterprise-grade encryption (AES-256 at rest, TLS 1.3 in transit), are SOC 2 Type II compliant, and are fully GDPR-compliant. Your lead data is never shared or sold. We perform regular security audits and maintain 99.9% uptime SLA on all paid plans."
  }
];

export const FAQSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section 
      ref={sectionRef}
      id="faq" 
      className="relative py-24 md:py-32 overflow-hidden"
      aria-labelledby="faq-heading"
    >
      {/* Unified background - matching hero */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px]"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.06) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
      </div>
      
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      
      <FAQSchema faqs={faqs} />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[720px] mx-auto">
          {/* Header */}
          <div className={`text-center mb-12 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Frequently asked questions
            </h2>
            <p className="text-lg text-muted-foreground max-w-md mx-auto leading-relaxed">
              Everything you need to know about SalesOS.
            </p>
          </div>

          {/* Accordion */}
          <div className={`scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '100ms' } as React.CSSProperties}>
            <Accordion type="single" collapsible className="space-y-2">
              {faqs.map((faq, index) => (
                <AccordionItem 
                  key={index} 
                  value={`item-${index}`}
                  className="border border-border/30 rounded-xl px-6 bg-card/40 data-[state=open]:bg-card/60 data-[state=open]:border-primary/20 transition-all duration-200"
                >
                  <AccordionTrigger className="text-left py-4 hover:no-underline hover:text-primary transition-colors duration-200">
                    <span className="font-medium text-[15px]">{faq.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 text-muted-foreground text-sm leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          
          <div className={`text-center mt-10 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '200ms' } as React.CSSProperties}>
            <p className="text-muted-foreground mb-3 text-sm">Still have questions?</p>
            <Link 
              to="/help" 
              className="inline-flex items-center gap-2 text-primary hover:underline font-medium text-sm group"
            >
              Visit our Help Center
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-150" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
