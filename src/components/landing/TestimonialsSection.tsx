import { useEffect, useRef, useState } from "react";
import { Quote, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const testimonials = [
  {
    quote: "The big win was speed. We could describe the accounts we wanted, review matches quickly, and get outreach moving without the usual list-building drag.",
    name: "Early user",
    title: "Founder-led sales team",
    company: "B2B SaaS",
    initials: "EU",
  },
  {
    quote: "SalesOS made the workflow feel simpler. Instead of bouncing between tools, we could keep prospecting and outreach in one place and move faster.",
    name: "Early user",
    title: "Outbound agency",
    company: "Agency",
    initials: "EU",
  },
  {
    quote: "What stood out was how fast we could go from a rough ICP idea to a workable outreach list. That saved a lot of manual effort right away.",
    name: "Early user",
    title: "Revenue team",
    company: "Growth-stage B2B",
    initials: "EU",
  },
];

const stats = [
  { value: "Faster", label: "from ICP to outreach", context: "less time lost to setup and list-building" },
  { value: "Clearer", label: "lead prioritization", context: "better visibility into who to contact first" },
  { value: "Simpler", label: "sales workflow", context: "fewer tools and handoffs to manage" },
];

export const TestimonialsSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

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
      {/* Unified background */}
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
          <div className={`text-center mb-14 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-5">
              <Quote className="w-3 h-3" />
              Early Users
            </div>
            <h2 id="testimonials-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              What teams are saying
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              From our early access cohort. Real results from real sales teams.
            </p>
          </div>

          {/* Testimonial cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
            {testimonials.map((t, index) => (
              <article
                key={index}
                className={`group relative p-6 rounded-xl border border-border/30 bg-card/40 card-hover-lift scroll-reveal ${
                  isVisible ? 'visible' : ''
                }`}
                style={{ '--reveal-delay': `${index * 80}ms` } as React.CSSProperties}
              >
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />

                <div className="relative z-10">
                  <Quote className="w-5 h-5 text-primary/40 mb-4" aria-hidden="true" />
                  <p className="text-sm text-foreground/80 leading-relaxed mb-5 italic">
                    "{t.quote}"
                  </p>
                  <div className="flex items-center gap-3 pt-4 border-t border-border/20">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.title}, {t.company}</p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Grounded stats */}
          <div className={`grid grid-cols-3 gap-4 mb-10 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '280ms' } as React.CSSProperties}>
            {stats.map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight gradient-number mb-1">{s.value}</p>
                <p className="text-sm font-medium text-foreground mb-0.5">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.context}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '360ms' } as React.CSSProperties}>
            <Button
              variant="hero"
              size="lg"
              onClick={() => navigate("/auth")}
              className="group"
            >
              Join early access
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <p className="text-xs text-muted-foreground mt-3">Free to start. No credit card required.</p>
          </div>
        </div>
      </div>

      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
