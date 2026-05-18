import { useEffect, useRef, useState } from "react";

// Stats are product-design facts, not fabricated customer benchmarks.
// Update with real data as you collect it.

export const BigStatSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.25 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const stats = [
    {
      display: "< 2 min",
      label: "From ICP description to ranked lead list",
      sub: "No boolean search. No list-building.",
    },
    {
      display: "1 tool",
      label: "Search → enrich → draft → send",
      sub: "Stop switching between Apollo, Clay, and Gmail",
    },
    {
      display: "$0",
      label: "To start — free plan, no credit card",
      sub: "Upgrade only when it's clearly worth it",
    },
  ];

  return (
    <section
      ref={ref}
      className="relative py-20 md:py-28 overflow-hidden"
      style={{
        background: "hsl(0,0%,3%)",
        borderTop: "1px solid hsl(261 75% 50% / 0.18)",
        borderBottom: "1px solid hsl(261 75% 50% / 0.18)",
      }}
      aria-label="Key metrics"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, hsl(261 75% 55% / 0.09) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-6 max-w-5xl relative z-10">
        <p
          className={`text-center text-[10px] font-medium uppercase tracking-[0.28em] mb-12 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          style={{ color: "hsl(261 75% 60%)" }}
        >
          The workflow
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="flex flex-col items-center md:items-start text-center md:text-left px-8 py-6 transition-all duration-700"
              style={{
                borderRight: i < 2 ? "1px solid hsl(261 75% 50% / 0.12)" : undefined,
                transitionDelay: `${i * 120}ms`,
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(16px)",
              }}
            >
              <span
                className="font-display block mb-2"
                style={{
                  fontSize: "clamp(2.8rem, 5vw, 4.5rem)",
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  background: "linear-gradient(135deg, hsl(261 75% 78%) 0%, hsl(280 80% 70%) 60%, hsl(261 75% 62%) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {stat.display}
              </span>
              <span className="block text-sm font-semibold mb-1" style={{ color: "hsl(0 0% 80%)" }}>
                {stat.label}
              </span>
              <span className="block text-xs" style={{ color: "hsl(261 75% 60% / 0.55)" }}>
                {stat.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
