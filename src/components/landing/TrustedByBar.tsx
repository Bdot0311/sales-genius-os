import { useEffect, useRef, useState } from "react";
import { Shield, Zap, BarChart3 } from "lucide-react";

const signals = [
  { icon: Zap, text: "Replaces 5+ disconnected tools" },
  { icon: BarChart3, text: "Built for high-volume outbound" },
  { icon: Shield, text: "Enterprise-grade security" },
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
      className="relative -mt-2 sm:-mt-4 pb-8 sm:pb-10 pt-0 border-b border-border/10 z-10"
      aria-label="Platform signals"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div
          className={`grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8 max-w-3xl mx-auto transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
        >
          {signals.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-center gap-2 text-muted-foreground/60"
            >
              <s.icon className="w-3.5 h-3.5 text-primary/60 flex-shrink-0" />
              <span className="text-xs font-medium">{s.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
