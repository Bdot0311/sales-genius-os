import { 
  Brain, 
  Mail, 
  Calendar, 
  TrendingUp, 
  Mic, 
  Workflow, 
  ArrowRight,
  Sparkles
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const features = [
  {
    icon: Brain,
    title: "AI Lead Scoring",
    description: "Machine learning analyzes engagement and company fit to predict which leads are most likely to convert.",
    color: "from-violet-500/20 to-purple-500/20",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-400"
  },
  {
    icon: Mail,
    title: "Smart Outreach",
    description: "Generate personalized emails and sequences that feel human. AI adapts tone and messaging per prospect.",
    color: "from-blue-500/20 to-cyan-500/20",
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-400"
  },
  {
    icon: Calendar,
    title: "Auto Scheduling",
    description: "Book meetings without the back-and-forth. Smart scheduling finds optimal times for both parties.",
    color: "from-amber-500/20 to-orange-500/20",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-400"
  },
  {
    icon: TrendingUp,
    title: "Pipeline Analytics",
    description: "Visualize your funnel health. Track conversion rates, identify bottlenecks, forecast revenue.",
    color: "from-emerald-500/20 to-green-500/20",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-400"
  },
  {
    icon: Mic,
    title: "Sales Coaching",
    description: "Real-time AI coaching during calls. Get objection handling tips and closing strategies on demand.",
    color: "from-pink-500/20 to-rose-500/20",
    iconBg: "bg-pink-500/10",
    iconColor: "text-pink-400"
  },
  {
    icon: Workflow,
    title: "Workflow Builder",
    description: "Drag-and-drop automation for every scenario. Build complex sequences without writing code.",
    color: "from-indigo-500/20 to-violet-500/20",
    iconBg: "bg-indigo-500/10",
    iconColor: "text-indigo-400"
  },
];

export const Features = () => {
  const [visibleItems, setVisibleItems] = useState<Set<number>>(new Set());
  const [headerVisible, setHeaderVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
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
      {/* Animated background elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-primary/5 rounded-full blur-[150px] pointer-events-none animate-glow-pulse" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Floating decorative elements */}
      <div className="absolute top-20 left-10 w-2 h-2 bg-primary/30 rounded-full animate-float" />
      <div className="absolute top-40 right-20 w-3 h-3 bg-accent/30 rounded-full animate-float" style={{ animationDelay: '1s' }} />
      <div className="absolute bottom-40 left-1/4 w-2 h-2 bg-primary/20 rounded-full animate-float" style={{ animationDelay: '2s' }} />
      
      <div className="container relative z-10 mx-auto px-6">
        {/* Section header */}
        <div className={`max-w-3xl mx-auto text-center mb-16 md:mb-20 transition-all duration-1000 ${
          headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
        }`}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Powerful Features</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Everything you need to{" "}
            <span className="text-gradient-animated">sell smarter</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Six powerful modules working together to automate your entire sales workflow—from discovery to close.
          </p>
        </div>

        {/* Features grid - Bento style */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <article 
              key={index}
              ref={(el) => (itemRefs.current[index] = el)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`group relative p-6 rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all duration-700 cursor-default ${
                visibleItems.has(index) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              } ${hoveredIndex === index ? 'scale-[1.02] border-primary/50 shadow-xl shadow-primary/10' : ''}`}
            >
              {/* Gradient background on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
              
              {/* Spotlight effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{
                  background: 'radial-gradient(400px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), hsl(261 75% 65% / 0.1), transparent 40%)'
                }}
              />
              
              {/* Content */}
              <div className="relative z-10">
                {/* Icon with enhanced styling */}
                <div className={`w-14 h-14 rounded-xl ${feature.iconBg} flex items-center justify-center mb-5 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
                  <feature.icon className={`w-7 h-7 ${feature.iconColor}`} />
                </div>
                
                <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors duration-300">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
                
                {/* Hover arrow with slide effect */}
                <div className="absolute bottom-6 right-6 opacity-0 translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <ArrowRight className="w-5 h-5 text-primary" />
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
