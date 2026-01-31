import { useEffect, useRef, useState } from "react";
import { Brain, Mail, Calendar, TrendingUp, Mic, Workflow, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

const modules = [
  {
    icon: Brain,
    title: "Prioritize who's most likely to convert",
    description: "AI Lead Scoring analyzes engagement and fit signals to rank your leads by conversion probability.",
  },
  {
    icon: Mail,
    title: "Write emails that feel human (without the time)",
    description: "Smart Outreach generates personalized messages based on each prospect's profile and company data.",
  },
  {
    icon: Calendar,
    title: "Book meetings without back-and-forth",
    description: "Auto Scheduling finds optimal times and handles the coordination so you can skip the email chains.",
  },
  {
    icon: TrendingUp,
    title: "See bottlenecks and forecast revenue",
    description: "Pipeline Analytics visualizes your funnel health and predicts revenue with deal-stage tracking.",
  },
  {
    icon: Mic,
    title: "Real-time coaching for objections + closes",
    description: "Sales Coaching provides instant suggestions during calls to help you navigate tough conversations.",
  },
  {
    icon: Workflow,
    title: "Automate follow-ups and handoffs without code",
    description: "Workflow Builder lets you create complex sequences with drag-and-drop simplicity.",
  },
];

export const ModulesSection = () => {
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
      id="features" 
      className="py-24 bg-muted/30 border-y border-border/40"
      aria-labelledby="modules-heading"
    >
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className={`text-center mb-16 transition-all duration-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <h2 id="modules-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Everything you need to close more deals
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Six modules working together to automate your entire sales workflow.
            </p>
          </div>

          {/* Modules grid - 6 cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {modules.map((module, index) => (
              <article 
                key={index}
                className={`group p-6 rounded-xl border border-border/40 bg-card/50 transition-all duration-500 hover:border-primary/30 hover:bg-card/80 ${
                  isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: `${index * 80}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <module.icon className="w-6 h-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors feature-description">
                  {module.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {module.description}
                </p>
              </article>
            ))}
          </div>

          {/* Watch demo link */}
          <div className={`text-center transition-all duration-700 delay-500 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <Button 
              variant="outline"
              className="group"
              onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Play className="w-4 h-4 mr-2" aria-hidden="true" />
              Watch demo
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
