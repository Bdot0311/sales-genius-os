import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How does the AI-powered email generation work?",
    answer: "Our AI analyzes your lead's profile, company data, and your specified tone/goal to craft personalized emails. It uses advanced language models to ensure each message feels authentic and relevant to the recipient."
  },
  {
    question: "Can I integrate SalesOS with my existing CRM?",
    answer: "Yes! SalesOS integrates with popular CRMs like HubSpot, Salesforce, and many others. You can also use Zapier to connect with 5000+ apps for custom workflows."
  },
  {
    question: "What's included in the free trial?",
    answer: "The free trial includes full access to all features for 14 days - lead management, AI email generation, pipeline tracking, analytics, and all integrations. No credit card required."
  },
  {
    question: "How accurate is the lead scoring system?",
    answer: "Our AI lead scoring uses machine learning trained on millions of sales interactions. It analyzes multiple data points including engagement history, company fit, and behavioral signals to predict conversion likelihood with over 85% accuracy."
  },
  {
    question: "Can I cancel my subscription anytime?",
    answer: "Absolutely. You can cancel your subscription at any time from your account settings. There are no long-term contracts or cancellation fees."
  },
  {
    question: "Do you offer team collaboration features?",
    answer: "Yes! All paid plans include team collaboration features like shared pipelines, deal assignments, activity tracking, and team performance analytics."
  },
  {
    question: "How secure is my data?",
    answer: "We take security seriously. All data is encrypted in transit and at rest, we're SOC 2 Type II certified, and we're fully GDPR compliant. Your data is stored in secure data centers with regular backups."
  },
  {
    question: "What kind of support do you offer?",
    answer: "We offer email support for all users, with priority support and dedicated account managers available for Pro and Enterprise plans."
  }
];

export const FAQ = () => {
  return (
    <section id="faq" className="py-24 bg-background">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Frequently Asked
            <span className="bg-gradient-primary bg-clip-text text-transparent"> Questions</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about SalesOS
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="bg-card border border-border rounded-lg px-6 hover:border-primary/50 transition-colors"
              >
                <AccordionTrigger className="text-left hover:no-underline py-6">
                  <span className="font-semibold">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-6">
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
