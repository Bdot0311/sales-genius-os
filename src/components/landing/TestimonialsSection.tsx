import { useEffect, useRef, useState } from "react";
import { TrendingUp, Target, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const outcomes = [
  {
    icon: TrendingUp,
    title: "Less manual prospecting",
    description:
      "Spend less time building lists by hand and more time moving from target idea to real outreach.",
  },
  {
    icon: Target,
    title: "Clearer lead prioritization",
    description:
      "See better-fit prospects first so your team focuses on accounts that actually look worth contacting.",
  },
  {
    icon: Sparkles,
    title: "More relevant outbound",
    description:
      "Use lead and company context to create outreach that feels more specific and less like generic mail-merge spam.",
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
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] aurora-ambient"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.08) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
      </div>

      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className={`text-center mb-14 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-5">
              Why teams would use this
            </div>
            <h2 id="testimonials-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              What SalesOS is built to improve
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              Faster prospecting, clearer lead prioritization, and more relevant outreach for B2B teams running outbound.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-14">
            {outcomes.map((item, index) => (
              <article
                key={index}
                className={`group relative p-6 rounded-xl border border-border/30 bg-card/40 card-hover-lift scroll-reveal ${
                  isVisible ? 'visible' : ''
                }`}
                style={{ '--reveal-delay': `${index * 80}ms` } as React.CSSProperties}
              >
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none spotlight-card" />

                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <item.icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-3">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </article>
            ))}
          </div>

          <div className={`grid grid-cols-3 gap-4 mb-10 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '280ms' } as React.CSSProperties}>
            {stats.map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl sm:text-4xl font-extrabold tracking-tight gradient-number mb-1">{s.value}</p>
                <p className="text-sm font-medium text-foreground mb-0.5">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.context}</p>
              </div>
            ))}
          </div>

          <div className={`text-center scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '360ms' } as React.CSSProperties}>
            <Button
              variant="hero"
              size="lg"
              onClick={() => navigate('/pricing')}
              className="group"
            >
              View plans
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <p className="text-xs text-muted-foreground mt-3">Preview the workflow, then choose the plan that fits your team.</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
