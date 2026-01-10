import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQSchema } from "@/components/seo";

const faqs = [
  {
    question: "What does the 14-day trial include?",
    answer: "Everything. Full access to lead search, email sequences, pipeline management, and analytics. You can search for leads, send emails, and track deals just like a paying customer. We don't limit features during the trial."
  },
  {
    question: "How does lead search work?",
    answer: "You type a description of who you want to reach. Example: \"VP of Marketing at e-commerce companies, 50-200 employees, based in the US.\" SalesOS searches its database and returns matching leads with contact info, company data, and LinkedIn profiles. Each search uses one credit."
  },
  {
    question: "Where does the lead data come from?",
    answer: "We aggregate data from multiple commercial data providers and public sources. Each lead is verified before being returned. If an email bounces, we flag it in your pipeline."
  },
  {
    question: "Can I import my existing leads?",
    answer: "Yes. CSV import works. You can also add leads manually. Leads you import get enriched with additional data from our database - company info, social profiles, and an ICP score."
  },
  {
    question: "Does it integrate with my CRM?",
    answer: "We integrate with HubSpot, Salesforce, and Pipedrive for two-way sync. For other CRMs, you can use Zapier or our API. Some teams use SalesOS as their primary pipeline and skip the CRM entirely."
  },
  {
    question: "How does billing work?",
    answer: "Monthly subscription with search credits. Each plan includes a set number of credits that reset monthly. You can add more credits if you need them. All enrichment, scoring, and email sending is included - credits only apply to searching for new leads."
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. No long-term contracts. Cancel from your account settings and you won't be charged for the next month. Your data stays accessible for 30 days after cancellation."
  },
  {
    question: "Is there a free plan?",
    answer: "No. We offer a 14-day trial with full access. If SalesOS isn't worth paying for, we'd rather you know that before you start relying on it."
  }
];

export const FAQ = () => {
  return (
    <section id="faq" className="py-16 sm:py-20 bg-background">
      <FAQSchema faqs={faqs} />
      
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Common questions
          </h2>
          <p className="text-muted-foreground">
            If your question isn't here, email us. We respond within a few hours.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="bg-card border border-border rounded-lg px-6"
              >
                <AccordionTrigger className="text-left hover:no-underline py-5">
                  <span className="font-medium text-sm sm:text-base">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground pb-5 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};
