import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "VP of Sales, TechFlow",
    image: "SC",
    rating: 5,
    text: "SalesOS increased our qualified meetings by 3.2x in the first month. The AI outreach is incredibly effective - our response rates jumped from 8% to 24%."
  },
  {
    name: "Marcus Rodriguez",
    role: "Founder, GrowthLabs",
    image: "MR",
    rating: 5,
    text: "The automation workflows alone save us 15+ hours per week. We closed our first $100K deal using insights from the AI sales coach."
  },
  {
    name: "Emily Watson",
    role: "Sales Director, CloudScale",
    image: "EW",
    rating: 5,
    text: "Best sales tool we've ever used. The lead scoring is scary accurate - we're now focusing on leads that actually convert. ROI was positive within 3 weeks."
  },
  {
    name: "David Kim",
    role: "CEO, DataPeak",
    image: "DK",
    rating: 5,
    text: "SalesOS transformed how we sell. The analytics dashboard gives us insights we never had before. Our team's productivity has doubled."
  }
];

const stats = [
  { value: "3.2x", label: "Increase in qualified meetings" },
  { value: "24%", label: "Average email response rate" },
  { value: "15+", label: "Hours saved per week" },
  { value: "500+", label: "Companies using SalesOS" }
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
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Proven Results Across
              <span className="text-gradient-animated"> 500+ Companies</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Real metrics from real sales teams
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
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

        {/* Testimonials Section */}
        <div className={`text-center mb-16 transition-all duration-700 ${statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ transitionDelay: '600ms' }}>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            What Sales Leaders
            <span className="text-gradient-animated"> Are Saying</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Join hundreds of sales teams closing more deals with SalesOS
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {testimonials.map((testimonial, index) => (
            <Card 
              key={index}
              ref={(el) => (cardRefs.current[index] = el)}
              className={`p-8 bg-card border-border card-interactive transition-all duration-500 ${
                cardsVisible.has(index) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              }`}
            >
              <div className="flex items-center gap-4 mb-4">
                <Avatar className="w-12 h-12 bg-gradient-primary flex items-center justify-center text-white font-semibold animate-float" style={{ animationDelay: `${index * 0.5}s` }}>
                  {testimonial.image}
                </Avatar>
                <div className="flex-1">
                  <div className="font-semibold">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                </div>
                <div className="flex gap-1">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star 
                      key={i} 
                      className="w-4 h-4 fill-primary text-primary transition-transform duration-300 hover:scale-125" 
                      style={{ animationDelay: `${i * 0.1}s` }}
                    />
                  ))}
                </div>
              </div>
              <p className="text-muted-foreground leading-relaxed">{testimonial.text}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
