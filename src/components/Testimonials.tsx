import { useEffect, useRef, useState } from "react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "VP of Sales",
    company: "TechFlow",
    image: "SC",
    text: "SalesOS transformed how we approach outbound. The AI-generated emails feel genuinely personal, and our response rates increased 3x.",
    metric: "3x response rate"
  },
  {
    name: "Marcus Rodriguez",
    role: "Founder & CEO",
    company: "DataSync",
    image: "MR",
    text: "The automation workflows saved us 20+ hours per week. What used to take our team days now happens automatically.",
    metric: "20+ hours saved weekly"
  },
  {
    name: "Emily Watson",
    role: "Sales Director",
    company: "CloudBase",
    image: "EW",
    text: "Lead scoring accuracy is impressive. We're now focusing only on prospects most likely to convert. Game changer for our team.",
    metric: "85% scoring accuracy"
  },
  {
    name: "David Kim",
    role: "Head of Growth",
    company: "ScaleUp",
    image: "DK",
    text: "Finally, a platform that understands modern sales. The pipeline analytics gave us insights we never had before.",
    metric: "40% pipeline visibility"
  }
];

const stats = [
  { value: "500+", label: "Companies using SalesOS" },
  { value: "2M+", label: "Leads enriched" },
  { value: "94%", label: "Customer satisfaction" },
  { value: "$12M+", label: "Pipeline influenced" }
];

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
              }, index * 100);
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
    <section id="testimonials" className="py-24 md:py-32 bg-muted/30 relative">
      <div className="container mx-auto px-6">
        {/* Stats Section */}
        <div ref={statsRef} className="mb-20">
          <div className={`text-center mb-12 transition-all duration-700 ${
            statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-background text-sm text-muted-foreground mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Trusted by teams worldwide
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
              Results that speak for themselves
            </h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {stats.map((stat, index) => (
              <div 
                key={index} 
                className={`text-center p-6 rounded-2xl bg-background border border-border/50 transition-all duration-500 ${
                  statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: `${index * 100 + 200}ms` }}
              >
                <div className="text-3xl md:text-4xl font-bold text-foreground mb-1">
                  {stat.value}
                </div>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials Section */}
        <div className={`text-center mb-12 transition-all duration-700 ${
          statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`} style={{ transitionDelay: '400ms' }}>
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">
            What our customers say
          </h3>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div 
              key={index}
              ref={(el) => (cardRefs.current[index] = el)}
              className={`p-6 rounded-2xl bg-background border border-border/50 transition-all duration-500 hover:border-primary/30 ${
                cardsVisible.has(index) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
            >
              {/* Quote */}
              <p className="text-foreground leading-relaxed mb-6">
                "{testimonial.text}"
              </p>
              
              {/* Footer */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-sm font-semibold text-white">
                    {testimonial.image}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{testimonial.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {testimonial.role}, {testimonial.company}
                    </div>
                  </div>
                </div>
                <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  {testimonial.metric}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
