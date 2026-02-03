import { useEffect, useRef, useState } from "react";
import { Brain, Mail, Calendar, TrendingUp, Mic, Workflow } from "lucide-react";

const modules = [
  {
    icon: Brain,
    title: "AI Lead Scoring",
    outcome: "Know exactly who to call first",
    description: "Leads ranked by conversion probability. Stop guessing which prospects are worth your time.",
  },
  {
    icon: Mail,
    title: "Smart Outreach",
    outcome: "Send personalized emails in seconds",
    description: "AI writes based on each lead's profile, company, and role. No more copy-paste templates.",
  },
  {
    icon: Calendar,
    title: "Auto Scheduling",
    outcome: "Skip the email chains",
    description: "Prospects book directly into your calendar. No more back-and-forth coordination.",
  },
  {
    icon: TrendingUp,
    title: "Pipeline Analytics",
    outcome: "See where deals stall",
    description: "Visual funnel tracking with revenue forecasting. Know exactly what's closing this month.",
  },
  {
    icon: Mic,
    title: "Sales Coach",
    outcome: "Get instant suggestions",
    description: "Real-time coaching during tough conversations. Handle objections with confidence.",
  },
  {
    icon: Workflow,
    title: "Workflow Automation",
    outcome: "Never miss a follow-up",
    description: "Sequences run on autopilot. Leads get nurtured even when you're not working.",
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
      {/* Unified background */}
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
              Six modules. One system. Zero busywork.
            </p>
          </div>

          {/* Modules grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
                  <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors duration-200">
                    {module.title}
                  </h3>
                  <p className="text-sm text-primary/80 font-medium mb-2">
                    {module.outcome}
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {module.description}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
