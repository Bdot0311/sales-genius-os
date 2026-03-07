import { useEffect, useRef, useState } from "react";
import { Brain, Mail, Calendar, TrendingUp, Mic, Workflow, ArrowRight } from "lucide-react";

const modules = [
  {
    icon: Brain,
    title: "AI Lead Scoring",
    outcome: "Know exactly who to call first",
    description: "Leads ranked by conversion probability. Stop guessing which prospects are worth your time.",
    gradient: "from-primary/20 to-primary/5",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(261_75%_65%/0.15)]",
  },
  {
    icon: Mail,
    title: "Smart Outreach",
    outcome: "Send personalized emails in seconds",
    description: "AI writes based on each lead's profile, company, and role. No more copy-paste templates.",
    gradient: "from-[hsl(280_75%_60%/0.2)] to-[hsl(280_75%_60%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(280_75%_60%/0.15)]",
  },
  {
    icon: Calendar,
    title: "Auto Scheduling",
    outcome: "Skip the email chains",
    description: "Prospects book directly into your calendar. No more back-and-forth coordination.",
    gradient: "from-[hsl(200_75%_55%/0.2)] to-[hsl(200_75%_55%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(200_75%_55%/0.15)]",
  },
  {
    icon: TrendingUp,
    title: "Pipeline Analytics",
    outcome: "See where deals stall",
    description: "Visual funnel tracking with revenue forecasting. Know exactly what's closing this month.",
    gradient: "from-[hsl(150_60%_50%/0.2)] to-[hsl(150_60%_50%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(150_60%_50%/0.15)]",
  },
  {
    icon: Mic,
    title: "Sales Coach",
    outcome: "Get instant suggestions",
    description: "Real-time coaching during tough conversations. Handle objections with confidence.",
    gradient: "from-[hsl(320_75%_60%/0.2)] to-[hsl(320_75%_60%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(320_75%_60%/0.15)]",
  },
  {
    icon: Workflow,
    title: "Workflow Automation",
    outcome: "Never miss a follow-up",
    description: "Sequences run on autopilot. Leads get nurtured even when you're not working.",
    gradient: "from-[hsl(35_90%_55%/0.2)] to-[hsl(35_90%_55%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(35_90%_55%/0.15)]",
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
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              6 Modules. One System.
            </div>
            <h2 id="modules-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 max-w-2xl mx-auto">
              Everything you need to close more deals
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Each module is built to eliminate a specific bottleneck in your sales workflow.
            </p>
          </div>

          {/* Modules grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {modules.map((module, index) => (
              <article 
                key={index}
                className={`group relative p-6 rounded-xl border border-border/30 bg-card/40 card-hover-lift transition-shadow duration-300 ${module.accentColor} scroll-reveal ${
                  isVisible ? 'visible' : ''
                }`}
                style={{ '--reveal-delay': `${index * 70}ms` } as React.CSSProperties}
              >
                {/* Spotlight effect on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                
                <div className="relative z-10">
                  {/* Gradient icon container */}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${module.gradient} flex items-center justify-center mb-4 icon-float-hover`}>
                    <module.icon className="w-5.5 h-5.5 text-primary" aria-hidden="true" />
                  </div>
                  
                  <h3 className="font-semibold text-[15px] mb-1 group-hover:text-primary transition-colors duration-200">
                    {module.title}
                  </h3>
                  <p className="text-sm text-primary/80 font-medium mb-2 flex items-center gap-1.5">
                    {module.outcome}
                    <ArrowRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
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
