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
    answer: "SalesOS is an AI-powered lead discovery and outbound sales platform. Describe your ideal customer in plain English, get ranked matches with enriched profiles, and run personalized outreach, all from one system. It includes ICP profiling, email quality checks, a unified reply inbox, deliverability monitoring, and smart sequence branching."
  },
  {
    question: "Who is SalesOS for?",
    answer: "SalesOS is built for B2B sales teams, SDRs, founders, and growth marketers who need to find and reach qualified prospects faster. Whether you're a solo founder or a 50-person sales org, there's a plan that fits."
  },
  {
    question: "What is the ICP Builder?",
    answer: "The ICP Builder lets you define your Ideal Customer Profile with industries, company size, job titles, tech stack, and buying signals. Every lead gets an automatic ICP match score (0-100) so you instantly know which prospects are the best fit."
  },
  {
    question: "How does the Email Quality Checker work?",
    answer: "Before any email send, SalesOS runs five automated checks: spam word detection, length analysis, readability scoring, CTA clarity, and personalization depth. You get a clear quality score with actionable suggestions. It never blocks sending, just helps you improve."
  },
  {
    question: "What is the Unified Reply Inbox?",
    answer: "All prospect replies land in one inbox, automatically classified by intent: interested, meeting request, question, not now, out of office, or not interested. AI drafts context-aware responses you can edit and send in one click."
  },
  {
    question: "How does sequence branching work?",
    answer: "Each sequence step can branch into two paths based on engagement: one path for prospects who opened but didn't reply, and another for those who never opened. You can also A/B test subject lines and use pre-built templates to launch sequences faster."
  },
  {
    question: "What is the Deliverability Dashboard?",
    answer: "It monitors your sending reputation with mailbox health scores, warmup progress tracking, DNS checks (SPF, DKIM, DMARC), and smart sending rules. This helps ensure your emails land in the inbox, not the spam folder."
  },
  {
    question: "What integrations are available?",
    answer: "SalesOS currently integrates with Google Workspace (Gmail, Calendar). We're actively building integrations with Slack, HubSpot, Salesforce, Calendly, and Zapier. You can submit integration requests from your dashboard and we'll prioritize based on demand."
  },
  {
    question: "Is my data secure?",
    answer: "Yes. We use industry-standard encryption (AES-256 at rest, TLS in transit) and follow security best practices. Your lead data is never shared or sold. All data is stored in secure, managed infrastructure with regular backups."
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