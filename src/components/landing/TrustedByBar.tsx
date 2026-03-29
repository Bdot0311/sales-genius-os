import { useEffect, useRef, useState } from "react";

const companies = [
  "Relay", "Stackline", "Northflow", "Personio", "Lattice",
  "Fieldwork", "Notion", "Rippling", "Loom", "Aircall",
  "Clearbit", "Outreach", "Gong", "Mixpanel", "Intercom",
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

  // Duplicate list for seamless loop
  const doubled = [...companies, ...companies];

  return (
    <section
      ref={ref}
      className="relative -mt-2 sm:-mt-4 pb-10 sm:pb-12 pt-0 border-b border-border/10 z-10 overflow-hidden"
      aria-label="Trusted by sales teams"
    >
      <div
        className={`text-center mb-5 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
      >
        <p className="text-xs font-medium text-muted-foreground/50 uppercase tracking-widest">
          Trusted by <span className="text-muted-foreground/80 font-semibold">2,847+</span> sales teams including
        </p>
      </div>

      {/* Scrolling marquee */}
      <div
        className={`relative transition-all duration-700 ${isVisible ? "opacity-100" : "opacity-0"}`}
      >
        {/* Fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

        <div
          className="flex gap-3 w-max"
          style={{
            animation: "marquee 28s linear infinite",
          }}
          aria-hidden="true"
        >
          {doubled.map((name, i) => (
            <span
              key={i}
              className="inline-flex items-center px-3.5 py-1.5 rounded-full border border-border/20 bg-muted/10 text-xs font-medium text-muted-foreground/50 whitespace-nowrap select-none"
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </section>
  );
};
