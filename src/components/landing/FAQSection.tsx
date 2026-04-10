import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQSchema } from "@/components/seo";
import { useEffect, useRef, useState } from "react";

const faqs = [
  {
    question: "Do I need to know boolean search or SQL to use this?",
    answer:
      "No. You type who you want in plain English — like 'VP of Sales at NYC SaaS companies with 50–200 employees.' SalesOS handles the rest.",
  },
  {
    question: "What happens after I find a lead?",
    answer:
      "SalesOS enriches the contact with verified email and phone, scores them by ICP fit, and drafts a first-touch email using their company context. You review, edit, and send — from the same screen.",
  },
  {
    question: "How is this different from just buying a contact list?",
    answer:
      "A contact list gives you 10,000 names. SalesOS gives you 50 that are actually worth calling, ranked by fit, with a draft email ready for each one. Volume without qualification is just noise.",
  },
  {
    question: "What's the catch with the free plan?",
    answer:
      "No catch. The free plan lets you explore the full workflow with sample data. When you're ready to run live prospecting at volume, you upgrade. No auto-charge, no surprise fees.",
  },
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
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px]"
          style={{
            background:
              "radial-gradient(ellipse at center, hsl(261 75% 50% / 0.06) 0%, transparent 60%)",
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
          <div
            className={`text-center mb-12 scroll-reveal ${isVisible ? "visible" : ""}`}
          >
            <h2
              id="faq-heading"
              className="text-3xl sm:text-4xl font-bold tracking-tight"
            >
              Questions we actually get asked.
            </h2>
          </div>

          {/* Accordion */}
          <div
            className={`scroll-reveal ${isVisible ? "visible" : ""}`}
            style={{ "--reveal-delay": "100ms" } as React.CSSProperties}
          >
            <Accordion type="single" collapsible className="space-y-2">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="border border-border/30 rounded-xl px-6 bg-card/40 data-[state=open]:bg-card/60 data-[state=open]:border-primary/20 transition-all duration-200"
                >
                  <AccordionTrigger className="text-left py-4 hover:no-underline hover:text-primary transition-colors duration-200">
                    <span className="font-medium text-[15px]">
                      {faq.question}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 text-muted-foreground text-sm leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div
            className={`scroll-reveal ${isVisible ? "visible" : ""}`}
            style={{ "--reveal-delay": "200ms" } as React.CSSProperties}
          >
            <p className="text-center text-sm text-muted-foreground mt-8">
              Still have questions?{" "}
              <a href="/help" className="text-primary hover:underline">
                Talk to us →
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
