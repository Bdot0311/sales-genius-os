import { useEffect, useRef, useState } from "react";
import { Brain, Mail, TrendingUp, Mic, Workflow, ArrowRight, Target, Inbox, ShieldCheck } from "lucide-react";

const coreModules = [
  {
    icon: Target,
    title: "ICP Builder + Lead Scoring",
    outcome: "Know exactly who to call first",
    description: "Describe your ideal customer in plain English. Every lead gets a 0–100 match score so you spend time on prospects that are actually worth your time — not ones that look good on paper.",
    gradient: "from-primary/20 to-primary/5",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(261_75%_65%/0.15)]",
  },
  {
    icon: Mail,
    title: "Smart Outreach",
    outcome: "Send emails that feel personal",
    description: "AI writes each email from the lead's enriched profile — their role, company, tech stack. Five automated checks run before every send: spam words, readability, CTA clarity, length, and personalization depth.",
    gradient: "from-[hsl(280_75%_60%/0.2)] to-[hsl(280_75%_60%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(280_75%_60%/0.15)]",
  },
  {
    icon: Inbox,
    title: "Unified Reply Inbox",
    outcome: "Never miss a hot lead",
    description: "Every reply lands in one inbox, automatically sorted by intent: interested, meeting request, question, not now. AI drafts your response. You review and send.",
    gradient: "from-[hsl(200_75%_55%/0.2)] to-[hsl(200_75%_55%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(200_75%_55%/0.15)]",
  },
  {
    icon: TrendingUp,
    title: "Pipeline Analytics",
    outcome: "See exactly what's closing",
    description: "Drag-and-drop deal management with real-time forecasting. Spot where deals stall, track revenue by stage, and know which reps need attention — without building a spreadsheet.",
    gradient: "from-[hsl(150_60%_50%/0.2)] to-[hsl(150_60%_50%/0.05)]",
    accentColor: "group-hover:shadow-[0_0_30px_hsl(150_60%_50%/0.15)]",
  },
];

const alsoIncluded = [
  { icon: Workflow, label: "Sequence Branching & A/B Testing", description: "Set up a sequence once. SalesOS sends each follow-up at the right time, branches on opens and replies, and stops when someone responds." },
  { icon: ShieldCheck, label: "Deliverability Suite", description: "Warmup tracking, DNS health checks (SPF, DKIM, DMARC), and smart sending rules keep you out of spam." },
  { icon: Mic, label: "Sales Coach", description: "Real-time suggestions during live conversations so you handle objections with confidence." },
  { icon: Brain, label: "Workflow Builder", description: "Automate follow-ups and handoffs without writing code." },
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
