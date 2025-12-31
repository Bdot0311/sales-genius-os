import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const betaTesters = [
  {
    name: "Sarah C.",
    role: "Beta Tester, Sales Leader",
    image: "SC",
    rating: 5,
    text: "Incredible potential! During the beta, the AI outreach feature generated personalized sequences that felt genuinely human. Can't wait for the full launch."
  },
  {
    name: "Marcus R.",
    role: "Beta Tester, Startup Founder",
    image: "MR",
    rating: 5,
    text: "The automation workflows are game-changing. In just 2 weeks of testing, I could see how this would save hours of manual work."
  },
  {
    name: "Emily W.",
    role: "Beta Tester, Sales Director",
    image: "EW",
    rating: 5,
    text: "The lead scoring accuracy during beta testing was impressive. This is exactly what modern sales teams need."
  },
  {
    name: "David K.",
    role: "Beta Tester, CEO",
    image: "DK",
    rating: 5,
    text: "SalesOS has serious potential. The analytics dashboard in beta gave insights I've never seen in other tools. Excited for launch day!"
  }
];

const betaStats = [
  { value: "50+", label: "Beta testers" },
  { value: "94%", label: "Would recommend" },
  { value: "4.8", label: "Avg. satisfaction score" },
  { value: "Jan '26", label: "Official launch" }
];

const AnimatedCounter = ({ value, isVisible }: { value: string; isVisible: boolean }) => {
  const [displayValue, setDisplayValue] = useState("0");
  
  useEffect(() => {
    if (!isVisible) return;
    
    const numericMatch = value.match(/[\d.]+/);
    if (!numericMatch) {
      setDisplayValue(value);
      return;
    }
    
    const target = parseFloat(numericMatch[0]);
    const suffix = value.replace(numericMatch[0], "");
    const duration = 2000;
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        const formatted = target >= 10 ? Math.floor(current).toString() : current.toFixed(1);
        setDisplayValue(formatted + suffix);
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value, isVisible]);
  
  return <span className="count-up">{displayValue}</span>;
};

export const Testimonials = () => {
  const [statsVisible, setStatsVisible] = useState(false);
  const [cardsVisible, setCardsVisible] = useState<Set<number>>(new Set());
  const statsRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const statsObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setStatsVisible(true);
        }
      },
      { threshold: 0.3 }
    );

    const cardObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = cardRefs.current.indexOf(entry.target as HTMLDivElement);
            if (index !== -1) {
              setTimeout(() => {
                setCardsVisible((prev) => new Set([...prev, index]));
              }, index * 150);
            }
          }
        });
      },
      { threshold: 0.2 }
    );

    if (statsRef.current) {
      statsObserver.observe(statsRef.current);
    }

    cardRefs.current.forEach((ref) => {
      if (ref) cardObserver.observe(ref);
    });

    return () => {
      statsObserver.disconnect();
      cardObserver.disconnect();
    };
  }, []);

  return (
    <section id="testimonials" className="py-24 bg-background relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      
      <div className="container mx-auto px-6 relative">
        {/* Stats Section */}
        <div ref={statsRef} className="mb-24">
          <div className={`text-center mb-12 transition-all duration-700 ${statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-4">
              <span>🧪 Beta Program Results</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Early Feedback From
              <span className="text-gradient-animated"> Beta Testers</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Real feedback from our exclusive beta testing program
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {betaStats.map((stat, index) => (
              <div 
                key={index} 
                className={`text-center transition-all duration-700 ${statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                style={{ transitionDelay: `${index * 100 + 200}ms` }}
              >
                <div className="text-5xl md:text-6xl font-bold text-gradient-animated mb-2">
                  <AnimatedCounter value={stat.value} isVisible={statsVisible} />
                </div>
                <p className="text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Beta Testers Section */}
        <div className={`text-center mb-16 transition-all duration-700 ${statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ transitionDelay: '600ms' }}>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            What Beta Testers
            <span className="text-gradient-animated"> Are Saying</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Early impressions from our exclusive testing program
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {betaTesters.map((tester, index) => (
            <Card 
              key={index}
              ref={(el) => (cardRefs.current[index] = el)}
              className={`p-8 bg-card border-border card-interactive transition-all duration-500 ${
                cardsVisible.has(index) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`}
            >
              <div className="flex items-center gap-4 mb-4">
                <Avatar className="w-12 h-12 bg-gradient-primary flex items-center justify-center text-white font-semibold animate-float" style={{ animationDelay: `${index * 0.5}s` }}>
                  {tester.image}
                </Avatar>
                <div className="flex-1">
                  <div className="font-semibold">{tester.name}</div>
                  <div className="text-sm text-muted-foreground">{tester.role}</div>
                </div>
                <div className="flex gap-1">
                  {[...Array(tester.rating)].map((_, i) => (
                    <Star 
                      key={i} 
                      className="w-4 h-4 fill-primary text-primary transition-transform duration-300 hover:scale-125" 
                      style={{ animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-muted-foreground leading-relaxed">{tester.text}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
