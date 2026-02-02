import { useEffect, useRef, useState } from "react";
import { Quote, Beaker, Sparkles } from "lucide-react";

const betaTestimonials = [
  {
    quote: "We helped test SalesOS early on and the AI lead scoring was shockingly accurate. Found prospects we would've missed completely. Can't wait to see what it does at full scale.",
    name: "Marcus Chen",
    role: "Founding Beta Tester",
    company: "Early Access Program",
  },
  {
    quote: "During the beta, SalesOS cut our research time by 70%. The enrichment data was spot-on. If this was just the testing phase, the full product is going to be a game-changer.",
    name: "Sarah Mitchell",
    role: "Beta Program Participant",
    company: "Early Access Program",
  },
  {
    quote: "I was skeptical about another sales tool, but the beta results spoke for themselves. Pipeline visibility improved overnight. Excited to see the roadmap unfold.",
    name: "David Park",
    role: "Founding Member",
    company: "Early Access Program",
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
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section 
      ref={sectionRef}
      className="relative py-24 md:py-32 overflow-hidden"
      aria-labelledby="testimonials-heading"
    >
      {/* Unified background - matching hero */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] aurora-ambient"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.08) 0%, transparent 60%)',
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
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-6">
              <Beaker className="w-4 h-4" aria-hidden="true" />
              Beta Tester Feedback
            </div>
            <h2 id="testimonials-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              What our beta testers are saying
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Early feedback from our founding members during the testing phase.
            </p>
          </div>

          {/* Testimonials grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
            {betaTestimonials.map((testimonial, index) => (
              <article
                key={index}
                className={`group relative p-6 rounded-xl border border-border/30 bg-card/40 card-hover-lift scroll-reveal ${
                  isVisible ? 'visible' : ''
                }`}
                style={{ '--reveal-delay': `${index * 80}ms` } as React.CSSProperties}
              >
                {/* Spotlight effect on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />
                
                <div className="relative z-10">
                  <Quote className="w-8 h-8 text-primary/30 mb-4" aria-hidden="true" />
                  
                  <blockquote className="text-muted-foreground leading-relaxed mb-6">
                    "{testimonial.quote}"
                  </blockquote>
                  
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-medium text-sm">{testimonial.name}</div>
                      <div className="text-xs text-muted-foreground">{testimonial.role}</div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Beta note */}
          <div className={`mt-12 text-center scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '300ms' } as React.CSSProperties}>
            <p className="text-sm text-muted-foreground">
              <Beaker className="w-4 h-4 inline mr-1.5" aria-hidden="true" />
              SalesOS is now live — these reviews are from our beta testing phase
            </p>
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
