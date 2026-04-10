import { useEffect, useRef, useState } from "react";

const lines = [
  "You spend Monday building a list.",
  "Tuesday writing emails.",
  "Wednesday realizing half are wrong-fit.",
];

export const ProblemSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative py-24 md:py-32 overflow-hidden"
      aria-labelledby="problem-heading"
    >
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Section label */}
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground/50 mb-10">
            The Problem
          </p>

          {/* Staggered headline lines */}
          <h2 id="problem-heading" className="space-y-2 mb-12">
            {lines.map((line, index) => (
              <span
                key={index}
                className={`block text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight transition-all duration-700 ${
                  isVisible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                {line}
              </span>
            ))}
          </h2>

          {/* Subtext */}
          <p
            className={`text-lg text-muted-foreground font-light max-w-2xl mx-auto leading-relaxed transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: "400ms" }}
          >
            The average outbound team spends 40% of their week on research.
            SalesOS cuts that to under 20 minutes — and the leads are actually
            worth calling.
          </p>

          {/* Divider */}
          <div
            className={`mt-16 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent transition-all duration-700 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDelay: "500ms" }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
