import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "VP of Sales",
    company: "TechFlow",
    context: "B2B SaaS, 20-person team",
    initials: "SC",
    text: "SalesOS transformed how we approach outbound. The AI-generated emails feel genuinely personal, and our response rates increased 3x in the first month.",
    metric: "3× response rate",
  },
  {
    name: "Marcus Rodriguez",
    role: "Founder & CEO",
    company: "DataSync",
    context: "Series A startup, 15 employees",
    initials: "MR",
    text: "The automation workflows saved us 20+ hours per week. What used to take our team days now happens automatically—we're closing deals faster than ever.",
    metric: "20+ hours saved weekly",
  },
  {
    name: "Emily Watson",
    role: "Sales Director",
    company: "CloudBase",
    context: "Enterprise SaaS, 50-person sales org",
    initials: "EW",
    text: "Lead scoring accuracy is impressive. We're now focusing only on prospects most likely to convert. Our pipeline quality improved by 40% in 60 days.",
    metric: "40% better pipeline quality",
  },
  {
    name: "David Kim",
    role: "Head of Growth",
    company: "ScaleUp",
    context: "B2B marketplace, 30-person team",
    initials: "DK",
    text: "Finally, a platform that understands modern sales. The pipeline analytics gave us insights we never had before—we can actually forecast now.",
    metric: "Accurate revenue forecasting",
  },
];

export const TestimonialsSection = () => {
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
      id="testimonials" 
      className="relative py-24 md:py-32 bg-background"
      aria-labelledby="testimonials-heading"
    >
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          {/* Header */}
          <div className={`text-center mb-16 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <h2 id="testimonials-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              What sales teams are saying
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Real results from teams using SalesOS to grow their pipeline.
            </p>
          </div>

          {/* Testimonials grid */}
          <div className="grid md:grid-cols-2 gap-5">
            {testimonials.map((testimonial, index) => (
              <div 
                key={index}
                className={`group relative p-6 rounded-xl border border-border/30 bg-card/40 card-hover-lift scroll-reveal ${
                  isVisible ? 'visible' : ''
                }`}
                style={{ '--reveal-delay': `${index * 80}ms` } as React.CSSProperties}
              >
                {/* Spotlight effect on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                
                <div className="relative z-10">
                  {/* Stars */}
                  <div className="flex gap-0.5 mb-4" aria-label="5 out of 5 stars">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-primary text-primary" aria-hidden="true" />
                    ))}
                  </div>
                  
                  {/* Quote */}
                  <blockquote className="text-foreground leading-relaxed mb-6">
                    "{testimonial.text}"
                  </blockquote>
                  
                  {/* Footer */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-sm font-semibold text-primary-foreground flex-shrink-0">
                        {testimonial.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{testimonial.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {testimonial.role}, {testimonial.company}
                        </div>
                        <div className="text-xs text-muted-foreground/70">
                          ({testimonial.context})
                        </div>
                      </div>
                    </div>
                    <div className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium whitespace-nowrap flex-shrink-0">
                      {testimonial.metric}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
