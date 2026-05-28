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
    question: "Do I need boolean search or SQL to use this?",
    answer:
      "No. You type who you want in plain English, like 'VP of Sales at NYC SaaS companies with 50–200 employees.' SalesOS handles the rest.",
  },
  {
    question: "What happens after I find a lead?",
    answer:
      "SalesOS enriches the contact with a verified business email, scores them by ICP fit, and drafts a first-touch email using their company context. You review, edit, and send from the same screen.",
  },
  {
    question: "How is this different from just buying a contact list?",
    answer:
      "A contact list gives you 10,000 names. SalesOS gives you 50 that are actually worth emailing, ranked by fit, with a draft already written for each one. Volume without qualification is just noise.",
  },
  {
    question: "How does the free plan work?",
    answer:
      "The free plan lets you explore the full workflow with real sample data. No credit card, no auto-charge, no surprise fees. When you're ready to run live prospecting at volume, you upgrade.",
  },
  {
    question: "How does SalesOS verify email addresses?",
    answer:
      "Every business email goes through SMTP handshake verification plus multi-source enrichment before it reaches you. We don't deliver addresses we haven't confirmed. Bounced emails hurt your sender reputation, and we treat accuracy as non-negotiable.",
  },
  {
    question: "Is SalesOS only for email outreach?",
    answer:
      "Yes. SalesOS is built around email outreach. We score your leads, enrich their verified business email, and help you write a first-touch message worth reading. No cold calling, no phone numbers, no SMS.",
  },
  {
    question: "How does the AI email drafting work?",
    answer:
      "SalesOS pulls the prospect's role, company context, and growth signals (recent hires, funding, open roles) and uses that to write a first-touch email that references something real. You see the draft, edit it in seconds, and send. It's not a template with a name swapped in.",
  },
  {
    question: "Can I connect SalesOS to my existing tools?",
    answer:
      "Yes. SalesOS integrates with Gmail, HubSpot, Salesforce, Slack, Calendly, and Zapier. Leads and replies stay in sync with your CRM without manual exports.",
  },
];

export const FAQSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="faq"
      className="relative py-24 md:py-36 overflow-hidden"
      style={{ background: "hsl(261 75% 2% / 0.82)" }}
      aria-labelledby="faq-heading"
    >
      {/* Top hairline */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "hsl(261 75% 50% / 0.18)" }}
      />

      {/* Purple glow — left */}
      <div
        className="absolute top-1/2 left-0 -translate-y-1/2 w-[400px] h-[500px] pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at left, hsl(261 75% 55% / 0.07) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />

      <FAQSchema faqs={faqs} />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[720px] mx-auto">

          {/* Header */}
          <div
            className={`mb-14 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <p
              className="font-serif italic font-thin text-base text-center text-purple-500 mb-5"
            >
              FAQ
            </p>
            <h2
              id="faq-heading"
              className="font-display text-center text-5xl"
              style={{
                fontSize: "clamp(2rem, 4vw, 3.2rem)",
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color: "hsl(0 0% 93%)",
              }}
            >
              Questions we actually
              <br />
              <span
                className="italic animate-shiny"
                style={{
                  backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "url(#c3-noise)",
                }}
              >
                get asked.
              </span>
            </h2>
          </div>

          {/* Accordion */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: "150ms" }}
          >
            <Accordion type="single" collapsible className="flex flex-col">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="border-b"
                  style={{ borderColor: "hsl(261 75% 50% / 0.18)" }}
                >
                  <AccordionTrigger
                    className="text-left py-5 hover:no-underline transition-colors duration-200 group"
                    style={{ color: "hsl(0 0% 80%)" }}
                  >
                    <span
                      className="font-medium text-[15px] leading-snug group-hover:text-white transition-colors duration-200"
                    >
                      {faq.question}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent
                    className="pb-5 text-sm leading-relaxed"
                    style={{ color: "hsl(0 0% 100% / 0.7)" }}
                  >
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div
            className={`mt-10 transition-all duration-700 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDelay: "300ms" }}
          >
            <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.3)" }}>
              Still have questions?{" "}
              <a
                href="/help"
                className="transition-colors duration-150"
                style={{ color: "hsl(261 75% 65%)" }}
                onMouseEnter={(e) =>
                  ((e.target as HTMLElement).style.color =
                    "hsl(261 75% 80%)")
                }
                onMouseLeave={(e) =>
                  ((e.target as HTMLElement).style.color =
                    "hsl(261 75% 65%)")
                }
              >
                Talk to us →
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Bottom hairline */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "hsl(261 75% 50% / 0.18)" }}
      />
    </section>
  );
};
