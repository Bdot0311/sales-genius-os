import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQSchema } from "@/components/seo";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const faqs = [
  {
    question: "What's included in the free trial?",
    answer: "All plans include a 14-day free trial with full access to features. No credit card required to start. You'll get the complete experience to see how SalesOS can transform your sales process."
  },
  {
    question: "How do search credits work?",
    answer: "Search credits are used when discovering new leads. Each search query costs 1 credit. Previewing results, enrichment, exports, and all automation features are completely free and don't consume credits."
  },
  {
    question: "Can I change plans later?",
    answer: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect on your next billing cycle. When you upgrade, you'll get immediate access to the new features."
  },
  {
    question: "How does the AI email generation work?",
    answer: "Our AI analyzes each lead's profile, company data, and your specified tone to craft personalized emails. It uses advanced language models trained on successful sales outreach to ensure each message feels authentic."
  },
  {
    question: "What integrations are available?",
    answer: "SalesOS integrates with Google Workspace, Slack, Calendly, HubSpot, Salesforce, and 5000+ apps via Zapier. We're adding new integrations every week based on customer feedback."
  },
  {
    question: "Is my data secure?",
    answer: "Absolutely. We use enterprise-grade encryption, are SOC 2 Type II compliant, and never share your data. Your lead data and customer information are stored securely with regular backups."
  }
];

export const FAQ = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
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
      className="py-24 md:py-32 bg-background"
      aria-labelledby="faq-heading"
    >
      <FAQSchema faqs={faqs} />
      
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className={`text-center mb-12 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-sm text-muted-foreground mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              FAQ
            </div>
            <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Frequently asked questions
            </h2>
            <p className="text-muted-foreground">
              Everything you need to know about SalesOS
            </p>
          </div>

          {/* Accordion */}
          <div className={`transition-all duration-700 delay-200 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <Accordion type="single" collapsible className="space-y-3">
              {faqs.map((faq, index) => (
                <AccordionItem 
                  key={index} 
                  value={`item-${index}`}
                  className="border border-border/50 rounded-xl px-6 bg-card/30 data-[state=open]:bg-card/60 transition-colors"
                >
                  <AccordionTrigger className="text-left py-5 hover:no-underline">
                    <span className="font-medium">{faq.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          
          <div className={`text-center mt-10 transition-all duration-700 delay-400 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <p className="text-muted-foreground mb-3">Still have questions?</p>
            <Link 
              to="/help" 
              className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
            >
              Visit our Help Center →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
