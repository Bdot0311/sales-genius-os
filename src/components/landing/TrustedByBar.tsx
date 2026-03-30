import { useEffect, useRef, useState } from "react";
import { TrendingUp, Clock, Shield } from "lucide-react";

const signals = [
  { icon: TrendingUp, stat: "11.4%", label: "avg. reply rate in early cohort" },
  { icon: Clock, stat: "< 1 hr", label: "to first sequence live" },
  { icon: Shield, stat: "6.1% → 1.3%", label: "bounce rate improvement" },
];

export const TrustedByBar = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative -mt-2 sm:-mt-4 pb-10 sm:pb-12 pt-0 border-b border-border/10 z-10"
      aria-label="Early access results"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <p
          className={`text-center text-xs font-medium text-muted-foreground/40 uppercase tracking-widest mb-4 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        >
          From our early access cohort
        </p>

        {/* Company names from testimonials */}
        <div
          className={`flex items-center justify-center gap-3 mb-6 transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}
        >
          {["Relay", "Northflow Agency", "Stackline"].map((name, i) => (
            <span
              key={i}
              className="inline-flex items-center px-3 py-1 rounded-full border border-border/20 bg-muted/10 text-xs font-medium text-muted-foreground/50"
            >
              {name}
            </span>
          ))}
        </div>

        <div
          className={`grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
        >
          {signals.map((s, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-1 text-center"
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <s.icon className="w-3.5 h-3.5 text-primary/50 mb-0.5" />
              <span className="text-base font-bold text-foreground/80 tabular-nums">{s.stat}</span>
              <span className="text-xs text-muted-foreground/50">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
