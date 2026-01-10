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
import { useEffect, useRef, useState } from "react";

const features = [
  {
    icon: Brain,
    title: "Lead Intelligence Engine",
    description: "Import and enrich leads from the SalesOS Lead Intelligence Network. Auto-score by ICP match for laser-focused targeting."
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
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());
  const [headerVisible, setHeaderVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = itemRefs.current.indexOf(entry.target as HTMLElement);
            if (index !== -1) {
              setTimeout(() => {
                setVisibleItems((prev) => new Set([...prev, index]));
              }, index * 100);
            }
          }
        });
      },
      { threshold: 0.1, rootMargin: "50px" }
    );

    const headerObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHeaderVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    if (sectionRef.current) {
      headerObserver.observe(sectionRef.current);
    }

    itemRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      observer.disconnect();
      headerObserver.disconnect();
    };
  }, []);

  return (
    <section 
      ref={sectionRef}
      id="features" 
      className="py-16 sm:py-20 md:py-24 bg-background relative" 
      aria-labelledby="features-heading"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <header className={`text-center mb-12 sm:mb-16 transition-all duration-700 ${headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 id="features-heading" className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-4 px-4">
            Everything You Need to
            <span className="text-gradient-animated"> Dominate Sales</span>
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
            8 powerful modules that work together to automate your entire sales process
          </p>
        </header>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6" role="list">
          {features.map((feature, index) => (
            <article 
              key={index}
              ref={(el) => (itemRefs.current[index] = el)}
              role="listitem"
              className={`p-5 sm:p-6 bg-card border border-border rounded-lg card-interactive group cursor-default transition-all duration-500 ${
                visibleItems.has(index) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`}
            >
              <div 
                className="mb-3 sm:mb-4 w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-primary flex items-center justify-center icon-bounce" 
                aria-hidden="true"
              >
                <feature.icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold mb-2 group-hover:text-primary transition-colors duration-300">{feature.title}</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">{feature.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
