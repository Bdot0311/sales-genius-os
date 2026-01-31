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
      className="relative py-24 md:py-32 overflow-hidden"
      aria-labelledby="modules-heading"
    >
      {/* Unified background - matching hero */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[700px]"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.07) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
      </div>
      
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className={`text-center mb-16 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <h2 id="modules-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 max-w-2xl mx-auto">
              Everything you need to close more deals
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Six modules working together to automate your entire sales workflow.
            </p>
          </div>

          {/* Modules grid - 6 cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-12">
            {modules.map((module, index) => (
              <article 
                key={index}
                className={`group relative p-6 rounded-xl border border-border/30 bg-card/40 card-hover-lift scroll-reveal ${
                  isVisible ? 'visible' : ''
                }`}
                style={{ '--reveal-delay': `${index * 70}ms` } as React.CSSProperties}
              >
                {/* Spotlight effect on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                
                <div className="relative z-10">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors duration-200">
                    <module.icon className="w-5 h-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors duration-200 feature-description">
                    {module.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {module.description}
                  </p>
                </div>
              </article>
            ))}
          </div>

          {/* Watch demo link */}
          <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '400ms' } as React.CSSProperties}>
            <Button 
              variant="outline"
              className="group btn-outline-hover"
              onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Play className="w-4 h-4 mr-2" aria-hidden="true" />
              Watch demo
            </Button>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
