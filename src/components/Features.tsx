import { 
  Search, 
  Mail, 
  BarChart3,
  GitBranch,
  MessageSquare,
  Calendar
} from "lucide-react";

const features = [
  {
    icon: Search,
    title: "Lead search",
    description: "Type what you're looking for in plain English. \"Fintech founders in London with 20-50 employees.\" SalesOS returns matching leads from its database.",
    detail: "Results include verified emails, LinkedIn profiles, and company data."
  },
  {
    icon: Mail,
    title: "Email sequences",
    description: "Write your own emails or let the system generate them based on each lead's profile. Schedule multi-step sequences with automatic follow-ups.",
    detail: "Each email is personalized using actual data from the lead's company."
  },
  {
    icon: GitBranch,
    title: "Deal pipeline",
    description: "Drag-and-drop kanban board. Move deals through stages. See what's stuck and what's closing. Nothing fancy, just works.",
    detail: "Set up the stages that match how you actually sell."
  },
  {
    icon: BarChart3,
    title: "Performance tracking",
    description: "Open rates, reply rates, meetings booked, deals closed. Broken down by campaign, by rep, by time period.",
    detail: "See which sequences convert and which don't."
  },
  {
    icon: MessageSquare,
    title: "Sales coaching",
    description: "Ask questions about your pipeline. \"Why are deals stuck in proposal?\" The system analyzes your data and gives you specific answers.",
    detail: "Based on patterns in your own sales activity, not generic advice."
  },
  {
    icon: Calendar,
    title: "Calendar sync",
    description: "Connect Google Calendar or Outlook. Leads can book time directly from your emails. Meetings show up in your pipeline automatically.",
    detail: "No more back-and-forth on scheduling."
  }
];

export const Features = () => {
  return (
    <section 
      id="features" 
      className="py-16 sm:py-20 bg-background" 
      aria-labelledby="features-heading"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-3xl mx-auto mb-12">
          <h2 id="features-heading" className="text-2xl sm:text-3xl font-bold mb-4">
            What you can do
          </h2>
          <p className="text-muted-foreground">
            Each feature solves a specific problem in your sales process. 
            No filler features to inflate a feature list.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {features.map((feature, index) => (
            <article 
              key={index}
              className="p-6 bg-card border border-border rounded-lg"
            >
              <div 
                className="mb-4 w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center"
              >
                <feature.icon className="w-5 h-5 text-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{feature.description}</p>
              <p className="text-xs text-muted-foreground/70">{feature.detail}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
