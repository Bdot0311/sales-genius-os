import { useEffect, useRef, useState } from "react";
import { TrendingUp, Clock, Mail } from "lucide-react";

const companies = ["Relay", "Northflow Agency", "Stackline"];

const stats = [
  { icon: TrendingUp, stat: "11.4%", label: "Avg. reply rate", sub: "up from ~2.8% pre-switch" },
  { icon: Clock, stat: "< 1 hr", label: "To first sequence live", sub: "from signup to sending" },
  { icon: Mail, stat: "6.1% → 1.3%", label: "Bounce rate drop", sub: "in the first two weeks" },
];

export const TrustedByBar = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative py-14 sm:py-16 border-b border-border/10 z-10"
      aria-label="Early access results"
    >
      {/* Subtle background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 100%, hsl(261 75% 50% / 0.04) 0%, transparent 60%)" }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 sm:px-6">
        {/* Header */}
        <div
          className={`text-center mb-8 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
        >
          <p className="text-xs font-semibold text-muted-foreground/40 uppercase tracking-widest mb-4">
            From our early access cohort
          </p>
          {/* Company pills */}
          <div className="flex items-center justify-center flex-wrap gap-2">
            {companies.map((name, i) => (
              <span
                key={i}
                className="inline-flex items-center px-4 py-1.5 rounded-full border border-border/25 bg-muted/10 text-sm font-medium text-muted-foreground/60"
              >
                {name}
              </span>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-3 gap-px bg-border/10 rounded-2xl overflow-hidden border border-border/10 max-w-3xl mx-auto transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          {stats.map((s, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1.5 text-center bg-card/30 px-8 py-8 hover:bg-card/50 transition-colors duration-200"
            >
              <s.icon className="w-4 h-4 text-primary/50 mb-1" />
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight gradient-number tabular-nums">
                {s.stat}
              </span>
              <span className="text-sm font-semibold text-foreground/70">{s.label}</span>
              <span className="text-xs text-muted-foreground/40">{s.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
