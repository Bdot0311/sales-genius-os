import { Card } from "@/components/ui/card";
import { 
  Brain, 
  Mail, 
  Calendar, 
  TrendingUp, 
  Mic, 
  Workflow, 
  BarChart3,
  Lightbulb 
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Lead Intelligence Engine",
    description: "Import and enrich leads from Apollo, LinkedIn, and Crunchbase. Auto-score by ICP match for laser-focused targeting."
  },
  {
    icon: Mail,
    title: "AI Outreach Studio",
    description: "Generate personalized cold emails and LinkedIn messages with dynamic variables and tone calibration."
  },
  {
    icon: Calendar,
    title: "Meeting Automator",
    description: "Auto-schedule calls based on availability and lead responsiveness. Integrates with Google Calendar, Outlook, and Calendly."
  },
  {
    icon: TrendingUp,
    title: "Smart Deal Pipeline",
    description: "Kanban-style CRM with automatic stage advancement and built-in notifications for every deal milestone."
  },
  {
    icon: Mic,
    title: "AI Sales Coach",
    description: "Real-time call analysis with objection rebuttals and closing tips based on proven sales frameworks."
  },
  {
    icon: Workflow,
    title: "Automation Builder",
    description: "Drag-and-drop flow designer for complex sales automations. If-then rules for every scenario."
  },
  {
    icon: BarChart3,
    title: "Analytics Dashboard",
    description: "Track reply rates, booking ratios, conversion rates, and revenue by rep, channel, and campaign."
  },
  {
    icon: Lightbulb,
    title: "AI Recommendations",
    description: "Predictive insights on when to follow up, which channels convert best, and how to optimize messaging."
  }
];

export const Features = () => {
  return (
    <section id="features" className="py-24 bg-background relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Everything You Need to
            <span className="bg-gradient-primary bg-clip-text text-transparent"> Dominate Sales</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            8 powerful modules that work together to automate your entire sales process
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Card 
              key={index}
              className="p-6 bg-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-glow group"
            >
              <div className="mb-4 w-12 h-12 rounded-lg bg-gradient-primary flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
