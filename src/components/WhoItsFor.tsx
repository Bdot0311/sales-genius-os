import { Users, Briefcase, Building, Rocket } from "lucide-react";

const audiences = [
  {
    icon: Rocket,
    title: "Founders doing outbound",
    description: "You need meetings on your calendar, not another tool to configure. Search for prospects, send emails, track replies. That's it."
  },
  {
    icon: Users,
    title: "Sales teams",
    description: "Your reps spend too much time on data entry. SalesOS handles lead enrichment and scoring so they can focus on conversations."
  },
  {
    icon: Briefcase,
    title: "Agencies running outbound for clients",
    description: "Manage multiple campaigns from one place. Each client gets their own pipeline, their own sequences, their own reporting."
  },
  {
    icon: Building,
    title: "Revenue operators",
    description: "You need visibility into what's working. SalesOS tracks every touchpoint so you can actually see which channels convert."
  }
];

export const WhoItsFor = () => {
  return (
    <section className="py-16 sm:py-20 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Who uses SalesOS
          </h2>
          <p className="text-muted-foreground">
            Sales execution is different from sales management. 
            SalesOS is for people who actually need to book meetings and close deals, 
            not just report on them.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {audiences.map((audience, index) => (
            <div 
              key={index}
              className="p-6 bg-background border border-border rounded-lg"
            >
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center shrink-0">
                  <audience.icon className="w-5 h-5 text-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">{audience.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {audience.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
