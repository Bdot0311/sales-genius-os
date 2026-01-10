const steps = [
  {
    number: "1",
    title: "Describe who you want to reach",
    description: "Type a natural language query. \"Marketing directors at e-commerce companies in the US, 50-200 employees, using Shopify.\" The system parses your request and searches its lead database.",
    result: "You get a list of matching leads with contact info, company details, and relevance scores."
  },
  {
    number: "2",
    title: "Review and add leads to your pipeline",
    description: "Preview the results. Filter further if needed. Add the leads you want to reach to your pipeline. The system enriches each lead with additional data automatically.",
    result: "Each lead gets scored based on how well they match your ideal customer profile."
  },
  {
    number: "3",
    title: "Send personalized outreach",
    description: "Write your own email or use the AI to generate one. Each email pulls in specific details about the lead and their company. Set up a sequence with follow-ups.",
    result: "Emails go out on your schedule. Replies come back to your inbox and update the pipeline."
  },
  {
    number: "4",
    title: "Track and close deals",
    description: "Leads who respond move through your pipeline. You see every touchpoint, every email, every meeting. When a deal closes, it shows up in your revenue tracking.",
    result: "You know exactly which campaigns, channels, and messages are actually working."
  }
];

export const HowItWorks = () => {
  return (
    <section className="py-16 sm:py-20 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            How it works
          </h2>
          <p className="text-muted-foreground">
            Four steps from search to closed deal. This is the actual workflow, not a simplified diagram.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          {steps.map((step, index) => (
            <div 
              key={index}
              className="relative pl-12 pb-12 last:pb-0"
            >
              {/* Vertical line connecting steps */}
              {index < steps.length - 1 && (
                <div className="absolute left-[18px] top-10 bottom-0 w-px bg-border" />
              )}
              
              {/* Step number */}
              <div className="absolute left-0 top-0 w-9 h-9 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-semibold">
                {step.number}
              </div>
              
              {/* Content */}
              <div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground mb-3 leading-relaxed">
                  {step.description}
                </p>
                <p className="text-sm text-foreground/80 bg-background border border-border rounded-lg px-4 py-3">
                  <span className="font-medium">Result:</span> {step.result}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
