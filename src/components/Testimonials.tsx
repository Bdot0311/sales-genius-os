import { useEffect, useRef, useState } from "react";
import { Quote, Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "VP of Sales",
    company: "TechFlow",
    image: "SC",
    text: "SalesOS transformed how we approach outbound. The AI-generated emails feel genuinely personal, and our response rates increased 3x.",
    metric: "3x response rate",
    rating: 5
  },
  {
    name: "Marcus Rodriguez",
    role: "Founder & CEO",
    company: "DataSync",
    image: "MR",
    text: "The automation workflows saved us 20+ hours per week. What used to take our team days now happens automatically.",
    metric: "20+ hours saved weekly",
    rating: 5
  },
  {
    name: "Emily Watson",
    role: "Sales Director",
    company: "CloudBase",
    image: "EW",
    text: "Lead scoring accuracy is impressive. We're now focusing only on prospects most likely to convert. Game changer for our team.",
    metric: "85% scoring accuracy",
    rating: 5
  },
  {
    name: "David Kim",
    role: "Head of Growth",
    company: "ScaleUp",
    image: "DK",
    text: "Finally, a platform that understands modern sales. The pipeline analytics gave us insights we never had before.",
    metric: "40% pipeline visibility",
    rating: 5
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
            Loved by sales teams{" "}
            <span className="text-gradient-animated">everywhere</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            See how leading companies are transforming their sales process with SalesOS.
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
                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                  ))}
                </div>
                
                {/* Quote */}
                <p className="text-foreground leading-relaxed mb-6 group-hover:text-foreground transition-colors">
                  "{testimonial.text}"
                </p>
                
                {/* Footer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-sm font-semibold text-primary-foreground group-hover:scale-110 transition-transform duration-500">
                      {testimonial.image}
                    </div>
                    <div>
                      <div className="font-semibold">{testimonial.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {testimonial.role}, {testimonial.company}
                      </div>
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-semibold group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    {testimonial.metric}
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
