import { useEffect, useRef, useState } from "react";
import { Quote, Star } from "lucide-react";

const testimonials = [
  {
    title: "Plain-English targeting",
    summary: "Start with a natural-language ICP instead of stacking filters and spreadsheets.",
    detail: "Designed for teams that want lead discovery to feel more like strategy than list building.",
    accent: "ICP-first workflow"
  },
  {
    title: "Context-aware outreach",
    summary: "Lead context carries forward into first-draft emails so reps start with a stronger point of view.",
    detail: "Built to reduce blank-page work while keeping the final message reviewable by a human seller.",
    accent: "Lead context preserved"
  },
  {
    title: "One continuous workflow",
    summary: "Search, qualification, outreach, and pipeline updates live in one system instead of four disconnected tools.",
    detail: "Useful for revenue teams that want fewer handoffs between prospecting and execution.",
    accent: "Unified workspace"
  },
  {
    title: "Human-reviewed by design",
    summary: "AI speeds up drafting and prioritization, but the workflow still leaves room for operator judgment.",
    detail: "A better fit for teams that want assistance without losing control of message quality.",
    accent: "Operator in control"
  }
];

export const Testimonials = () => {
  const [cardsVisible, setCardsVisible] = useState<Set<number>>(new Set());
  const [headerVisible, setHeaderVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const headerObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHeaderVisible(true);
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

    if (headerRef.current) {
      headerObserver.observe(headerRef.current);
    }

    cardRefs.current.forEach((ref) => {
      if (ref) cardObserver.observe(ref);
    });

    return () => {
      headerObserver.disconnect();
      cardObserver.disconnect();
    };
  }, []);

  return (
    <section id="testimonials" className="py-24 md:py-32 bg-muted/20 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-1/2 left-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[150px] pointer-events-none -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="container relative z-10 mx-auto px-6">
        {/* Header */}
        <div ref={headerRef} className={`text-center mb-16 transition-all duration-1000 ${
          headerVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
        }`}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6">
            <Quote className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Customer Stories</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Built for sales teams{" "}
            <span className="text-gradient-animated">everywhere</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A few reasons revenue teams evaluate SalesOS when they want a faster path from targeting to outreach.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {testimonials.map((testimonial, index) => (
            <div 
              key={index}
              ref={(el) => (cardRefs.current[index] = el)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className={`group relative p-6 rounded-2xl bg-card/50 backdrop-blur-sm border border-border/50 overflow-hidden transition-all duration-700 ${
                cardsVisible.has(index) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
              } ${hoveredIndex === index ? 'border-primary/50 shadow-xl shadow-primary/10 scale-[1.02]' : ''}`}
            >
              {/* Gradient overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              {/* Quote icon */}
              <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Quote className="w-12 h-12 text-primary" />
              </div>
              
              <div className="relative z-10">
                {/* Accent */}
                <div className="flex gap-1 mb-4">
                  {[...Array(3)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-primary/70 text-primary/80" />
                  ))}
                </div>
                
                <h3 className="text-xl font-semibold text-foreground mb-3">{testimonial.title}</h3>
                <p className="text-foreground leading-relaxed mb-3 group-hover:text-foreground transition-colors">
                  {testimonial.summary}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                  {testimonial.detail}
                </p>
                
                {/* Footer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/80 to-accent/80 flex items-center justify-center text-sm font-semibold text-primary-foreground group-hover:scale-110 transition-transform duration-500">
                      <Quote className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold">Product signal</div>
                      <div className="text-sm text-muted-foreground">
                        Real workflow value without invented customer claims
                      </div>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    {testimonial.accent}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
