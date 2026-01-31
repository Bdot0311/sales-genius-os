import { 
  Brain, 
  Mail, 
  Calendar, 
  TrendingUp, 
  Mic, 
  Workflow, 
  BarChart3,
  Lightbulb,
  ArrowRight
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const features = [
  {
    icon: Brain,
    title: "AI Lead Scoring",
    description: "Machine learning analyzes engagement and company fit to predict which leads are most likely to convert.",
    gradient: "from-violet-500 to-purple-500"
  },
  {
    icon: Mail,
    title: "Smart Outreach",
    description: "Generate personalized emails and sequences that feel human. AI adapts tone and messaging per prospect.",
    gradient: "from-blue-500 to-cyan-500"
  },
  {
    icon: Calendar,
    title: "Auto Scheduling",
    description: "Book meetings without the back-and-forth. Smart scheduling finds optimal times for both parties.",
    gradient: "from-amber-500 to-orange-500"
  },
  {
    icon: TrendingUp,
    title: "Pipeline Analytics",
    description: "Visualize your funnel health. Track conversion rates, identify bottlenecks, forecast revenue.",
    gradient: "from-green-500 to-emerald-500"
  },
  {
    icon: Mic,
    title: "Sales Coaching",
    description: "Real-time AI coaching during calls. Get objection handling tips and closing strategies on demand.",
    gradient: "from-pink-500 to-rose-500"
  },
  {
    icon: Workflow,
    title: "Workflow Builder",
    description: "Drag-and-drop automation for every scenario. Build complex sequences without writing code.",
    gradient: "from-indigo-500 to-violet-500"
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
              }, index * 80);
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
      className="py-24 md:py-32 bg-background relative"
    >
      <div className="container mx-auto px-6">
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

        {/* Features grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <article 
              key={index}
              ref={(el) => (itemRefs.current[index] = el)}
              className={`group relative p-6 rounded-2xl border border-border/50 bg-card/30 hover:bg-card/60 hover:border-primary/30 transition-all duration-500 cursor-default ${
                visibleItems.has(index) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              
              {/* Content */}
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
              
              {/* Hover arrow */}
              <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-5 h-5 text-primary" />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
