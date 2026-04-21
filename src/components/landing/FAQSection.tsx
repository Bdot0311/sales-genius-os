import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQSchema } from "@/components/seo";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

const faqs = [
  {
    question: "Do I need boolean search or SQL to use this?",
    answer:
      "No. You type who you want in plain English — like 'VP of Sales at NYC SaaS companies with 50–200 employees.' SalesOS handles the rest.",
  },
  {
    question: "What happens after I find a lead?",
    answer:
      "SalesOS enriches the contact with a verified business email, scores them by ICP fit, and drafts a first-touch email using their company context. You review, edit, and send — from the same screen.",
  },
  {
    question: "How is this different from just buying a contact list?",
    answer:
      "A contact list gives you 10,000 names. SalesOS gives you 50 that are actually worth emailing, ranked by fit, with a draft already written for each one. Volume without qualification is just noise.",
  },
  {
    question: "What's the catch with the free plan?",
    answer:
      "No catch. The free plan lets you explore the full workflow with sample data. When you're ready to run live prospecting at volume, you upgrade. No auto-charge, no surprise fees.",
  },
  {
    question: "How does SalesOS verify email addresses?",
    answer:
      "Every business email goes through SMTP handshake verification plus multi-source enrichment before it reaches you. We don't deliver addresses we haven't verified — bounced emails hurt your sender reputation, so we treat accuracy as non-negotiable.",
  },
  {
    question: "Is SalesOS only for email outreach?",
    answer:
      "Yes — SalesOS is built exclusively around email. We score your leads, enrich their verified business email, and help you write a first-touch message worth reading. We don't do cold calling, phone numbers, or SMS.",
  },
  {
    question: "How does the AI email drafting work?",
    answer:
      "SalesOS pulls the prospect's role, company context, and growth signals — things like recent hires or funding — and uses that to write a first-touch email that references something real. You see the draft, edit it in seconds, and send. It's not a template with a name swapped in.",
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
      className="relative overflow-hidden py-24 sm:py-36"
      style={{ background: "hsl(34 33% 96%)" }}
      aria-labelledby="faq-heading"
    >
      <div className="absolute top-0 left-0 right-0 hairline" />

      <FAQSchema faqs={faqs} />

      <div className="relative z-10 mx-auto max-w-[1120px] px-6 sm:px-8">
        <div className="mx-auto max-w-[760px]">
          {/* Header */}
          <div
            className={`mb-14 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
          >
            <div className="mb-6 flex items-center gap-3">
              <span className="eyebrow">05 / FAQ</span>
              <span className="hairline w-12" />
            </div>
            <h2
              id="faq-heading"
              className="font-display"
              style={{
                fontSize: "clamp(2rem, 4.2vw, 3.2rem)",
                fontWeight: 400,
                lineHeight: 1.1,
                letterSpacing: "-0.022em",
                color: "hsl(28 10% 14%)",
              }}
            >
              Questions we{" "}
              <span className="italic" style={{ color: "hsl(14 59% 52%)", fontWeight: 500 }}>
                actually get asked.
              </span>
            </h2>
          </div>

          {/* Accordion — thin 1px rules, no boxes */}
          <div
            className={`transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
            style={{ transitionDelay: "150ms" }}
          >
            <Accordion type="single" collapsible className="flex flex-col">
              {faqs.map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="border-b"
                  style={{ borderColor: "hsl(28 10% 88%)" }}
                >
                  <AccordionTrigger
                    className="group py-6 text-left transition-colors duration-200 hover:no-underline"
                    style={{ color: "hsl(28 10% 14%)" }}
                  >
                    <span
                      className="pr-4 text-[17px] font-medium leading-snug transition-colors duration-200 group-hover:text-[hsl(14_59%_52%)]"
                    >
                      {faq.question}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent
                    className="pb-6 text-[15.5px] leading-relaxed"
                    style={{ color: "hsl(28 6% 38%)" }}
                  >
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div
            className={`mt-12 transition-all duration-700 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDelay: "300ms" }}
          >
            <p className="text-[15px]" style={{ color: "hsl(28 6% 38%)" }}>
              Still have questions?{" "}
              <a
                href="/help"
                className="cta-ghost inline-flex items-center gap-1 font-medium"
                style={{ color: "hsl(14 59% 52%)" }}
              >
                Talk to us
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 hairline" />
    </section>
  );
};
