import { Card } from "@/components/ui/card";

const metrics = [
  { value: "50+", label: "Active users" },
  { value: "12K+", label: "Leads searched this month" },
  { value: "94%", label: "User retention" },
  { value: "2.3x", label: "Average reply rate improvement" }
];

const earlyUsers = [
  {
    name: "Sarah C.",
    role: "Founder, SaaS startup",
    text: "I was spending 4 hours a day on lead research and data entry. Now I spend that time on calls. The lead search actually works - I describe who I want to reach and get real results."
  },
  {
    name: "Marcus R.",
    role: "Sales Director, Agency",
    text: "We run outbound for 8 clients from one SalesOS account. Each has their own pipeline and reporting. Before this, we were juggling multiple tools and losing track of follow-ups."
  },
  {
    name: "Emily W.",
    role: "Head of Sales, B2B SaaS",
    text: "The email personalization is what sold me. Each email references something specific about the lead's company. Our reply rates went from 3% to 7%. That's real numbers, not marketing speak."
  }
];

export const Proof = () => {
  return (
    <section className="py-16 sm:py-20 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            What we can show you
          </h2>
          <p className="text-muted-foreground">
            SalesOS is early. We're not going to pretend we have 10,000 customers. 
            Here's what we do have.
          </p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-16">
          {metrics.map((metric, index) => (
            <div 
              key={index} 
              className="text-center p-6 bg-background border border-border rounded-lg"
            >
              <div className="text-2xl sm:text-3xl font-bold mb-1">
                {metric.value}
              </div>
              <p className="text-sm text-muted-foreground">{metric.label}</p>
            </div>
          ))}
        </div>

        {/* Early user feedback */}
        <div className="max-w-3xl mx-auto">
          <h3 className="text-lg font-semibold mb-6">From early users</h3>
          <div className="grid gap-6">
            {earlyUsers.map((user, index) => (
              <Card 
                key={index}
                className="p-6 bg-background border-border"
              >
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  "{user.text}"
                </p>
                <div>
                  <div className="font-medium text-sm">{user.name}</div>
                  <div className="text-sm text-muted-foreground">{user.role}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
