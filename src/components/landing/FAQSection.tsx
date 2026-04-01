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
    question: "What is SalesOS?",
    answer: "SalesOS is a B2B prospecting and outreach platform built to help teams find qualified leads faster, enrich them with useful context, and start more personalized outbound from one workflow."
  },
  {
    question: "Who is SalesOS for?",
    answer: "SalesOS is best for founder-led sales teams, outbound agencies, SDR teams, and B2B operators who need a faster path from ideal customer profile to live outreach."
  },
  {
    question: "What makes SalesOS different from a lead database?",
    answer: "The goal is not just to hand you raw contact data. SalesOS is designed to help you define who you want, identify better-fit prospects, and move directly into outreach and follow-up."
  },
  {
    question: "Do I need boolean search skills to use it?",
    answer: "No. SalesOS is built around plain-English targeting so you can describe your ideal customer naturally instead of learning complicated database syntax."
  },
  {
    question: "Can I try it before paying?",
    answer: "Yes. You can start free, explore the workflow, and see how the product fits your process before upgrading to higher-volume prospecting and outreach features."
  },
  {
    question: "What integrations are available?",
    answer: "SalesOS currently supports Google Workspace and is expanding integration coverage for tools like Slack, HubSpot, Salesforce, Calendly, and Zapier."
  },
  {
    question: "Is SalesOS a fit for every business?",
    answer: "No. It is strongest for teams selling into businesses through outbound or sales-led motions. It is generally not the right fit for e-commerce, B2C, or companies that do not run outbound."
  },
  {
    question: "Is my data secure?",
    answer: "SalesOS uses standard security practices for protecting application and customer data, including encryption in transit and managed infrastructure controls."
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