import { useEffect, useRef, useState } from "react";

const lines = [
  { text: "You spend Monday building a list.", color: "hsl(0 0% 90%)" },
  { text: "Tuesday writing emails.", color: "hsl(0 0% 65%)" },
  { text: "Wednesday realizing half are wrong-fit.", color: "hsl(261 75% 68%)" },
];

export const ProblemSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.15 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ background: "hsl(0,0%,3%)" }}
      aria-labelledby="problem-heading"
    >
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

      <div
        className="absolute top-0 left-0 w-[500px] h-[500px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at top left, hsl(261 75% 55% / 0.08) 0%, transparent 65%)" }}
        aria-hidden="true"
      />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">

          <p
            className={`text-[10px] uppercase tracking-[0.28em] mb-10 font-medium transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ color: "hsl(261 75% 60%)" }}
          >
            The Problem
          </p>

          <h2 id="problem-heading" className="space-y-1 mb-12">
            {lines.map((line, index) => (
              <span
                key={index}
                className={`block font-display transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                style={{
                  transitionDelay: `${index * 110}ms`,
                  fontSize: "clamp(2rem, 5vw, 3.8rem)",
                  fontWeight: 800,
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                  color: line.color,
                }}
              >
                {line.text}
              </span>
            ))}
          </h2>

          <p
            className={`text-base font-light max-w-xl mx-auto leading-relaxed transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ transitionDelay: "400ms", color: "hsl(0 0% 100% / 0.38)" }}
          >
            The average outbound team burns 40% of their week on research before
            a single email goes out. SalesOS takes that from 2+ hours to under
            20 minutes — with every contact verified before it reaches you.
          </p>

          <div
            className={`mt-16 h-px mx-auto max-w-xs transition-all duration-700 ${isVisible ? "opacity-100" : "opacity-0"}`}
            style={{
              transitionDelay: "500ms",
              background: "linear-gradient(to right, transparent, hsl(261 75% 50% / 0.3), transparent)",
            }}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />
    </section>
  );
};
