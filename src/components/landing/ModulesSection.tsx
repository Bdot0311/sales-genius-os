import { useEffect, useRef, useState } from "react";
import { Brain, Mail, TrendingUp, Mic, Workflow, ArrowRight, Target, Inbox, ShieldCheck } from "lucide-react";

const coreModules = [
  {
    icon: Target,
    title: "Plain-English ICP Search",
    outcome: "Find the right prospects faster",
    description: "Describe your target customer naturally instead of wrestling with filters and boolean logic. SalesOS turns that into a workable lead search flow.",
    gradient: "from-primary/20 to-primary/5",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(261_75%_65%/0.15)]",
  },
  {
    icon: Mail,
    title: "Personalized Outreach",
    outcome: "Write smarter first touches",
    description: "Use company and contact context to generate more tailored outbound messages, then review and refine before sending.",
    gradient: "from-[hsl(280_75%_60%/0.2)] to-[hsl(280_75%_60%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(280_75%_60%/0.15)]",
  },
  {
    icon: Inbox,
    title: "Reply Management",
    outcome: "Keep momentum after the first email",
    description: "Track responses, manage follow-ups, and keep conversations organized so promising leads do not disappear into a messy inbox.",
    gradient: "from-[hsl(200_75%_55%/0.2)] to-[hsl(200_75%_55%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(200_75%_55%/0.15)]",
  },
  {
    icon: TrendingUp,
    title: "Pipeline Visibility",
    outcome: "See what is actually moving",
    description: "Understand where deals are progressing, where outreach is stalling, and where your team should focus next.",
    gradient: "from-[hsl(150_60%_50%/0.2)] to-[hsl(150_60%_50%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(150_60%_50%/0.15)]",
  },
];

const alsoIncluded = [
  { icon: Workflow, label: "Sequences and follow-up logic", description: "Build repeatable outbound workflows without manually tracking every next step." },
  { icon: ShieldCheck, label: "Deliverability support", description: "Monitor key sending health signals so your outreach has a better chance of landing in inboxes." },
  { icon: Mic, label: "Sales coaching tools", description: "Support reps with guidance before and during real conversations." },
  { icon: Brain, label: "Automation building blocks", description: "Reduce repetitive sales work with workflow automations that keep the process moving." },
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
              Core Platform
            </div>
            <h2 id="modules-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 max-w-2xl mx-auto">
              From first lead to closed deal — in one place
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              The core workflow: find the right leads, reach out with quality-checked emails, manage every reply, and track what's closing.
            </p>
          </div>

          {/* Core modules grid */}
          <div className="grid sm:grid-cols-2 gap-5 mb-12">
            {coreModules.map((module, index) => (
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

          {/* Also included */}
          <div className={`rounded-xl border border-border/20 bg-muted/20 p-6 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '320ms' } as React.CSSProperties}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Also included</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {alsoIncluded.map((item, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                    <item.icon className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground leading-snug mb-0.5">{item.label}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
