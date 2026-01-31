import { 
  Brain, 
  Mail, 
  Calendar, 
  TrendingUp, 
  Mic, 
  Workflow, 
  ArrowRight
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const features = [
  {
    icon: Brain,
    title: "AI Lead Scoring",
    description: "Machine learning analyzes engagement and company fit to predict which leads are most likely to convert.",
  },
  {
    icon: Mail,
    title: "Smart Outreach",
    description: "Generate personalized emails and sequences that feel human. AI adapts tone and messaging per prospect.",
  },
  {
    icon: Calendar,
    title: "Auto Scheduling",
    description: "Book meetings without the back-and-forth. Smart scheduling finds optimal times for both parties.",
  },
  {
    icon: TrendingUp,
    title: "Pipeline Analytics",
    description: "Visualize your funnel health. Track conversion rates, identify bottlenecks, forecast revenue.",
  },
  {
    icon: Mic,
    title: "Sales Coaching",
    description: "Real-time AI coaching during calls. Get objection handling tips and closing strategies on demand.",
  },
  {
    icon: Workflow,
    title: "Workflow Builder",
    description: "Drag-and-drop automation for every scenario. Build complex sequences without writing code.",
  },
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
      className="py-24 md:py-32 bg-background relative overflow-hidden"
    >
      {/* Background accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-primary/5 rounded-full blur-[150px] pointer-events-none" />
      
      <div className="container relative z-10 mx-auto px-6">
        {/* Section header */}
        <div className={`max-w-3xl mx-auto text-center mb-16 md:mb-20 transition-all duration-700 ${
          headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted text-sm text-muted-foreground mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Features
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Everything you need to{" "}
            <span className="text-primary">sell smarter</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Six powerful modules working together to automate your entire sales workflow—from discovery to close.
          </p>
        </div>

        {/* Features grid with bento-style layout */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <article 
              key={index}
              ref={(el) => (itemRefs.current[index] = el)}
              className={`group relative p-6 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm hover:bg-card/60 hover:border-primary/30 transition-all duration-500 cursor-default spotlight hover-lift ${
                visibleItems.has(index) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`}
            >
              {/* Icon with primary background */}
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              
              {/* Content */}
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
              
              {/* Hover arrow */}
              <div className="absolute bottom-6 right-6 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                <ArrowRight className="w-5 h-5 text-primary" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
