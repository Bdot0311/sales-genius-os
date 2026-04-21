import { useEffect, useRef, useState } from "react";

const lines = [
  { text: "You spend Monday building a list.", tone: "ink" as const },
  { text: "Tuesday writing emails.", tone: "muted" as const },
  { text: "Wednesday realizing half are wrong-fit.", tone: "accent" as const },
];

export const ProblemSection = () => {
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
      className="relative overflow-hidden py-24 sm:py-32"
      style={{ background: "hsl(34 33% 96%)" }}
      aria-labelledby="problem-heading"
    >
      {/* Top hairline */}
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative z-10 mx-auto max-w-[1120px] px-6 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Eyebrow with ornament */}
          <div className="mb-10 flex items-center justify-center gap-3">
            <span className="hairline w-8" />
            <span className="eyebrow">The problem</span>
            <span className="hairline w-8" />
          </div>

          {/* Staggered headline lines */}
          <h2 id="problem-heading" className="space-y-2">
            {lines.map((line, index) => (
              <span
                key={index}
                className={`block font-display transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
                }`}
                style={{
                  transitionDelay: `${index * 120}ms`,
                  fontSize: "clamp(1.9rem, 4.6vw, 3.25rem)",
                  fontWeight: 400,
                  lineHeight: 1.1,
                  letterSpacing: "-0.022em",
                  fontStyle: line.tone === "accent" ? "italic" : "normal",
                  color:
                    line.tone === "accent" ? "hsl(14 59% 52%)" :
                    line.tone === "muted"  ? "hsl(28 6% 52%)" :
                                             "hsl(28 10% 14%)",
                }}
              >
                {line.text}
              </span>
            ))}
          </h2>

          {/* Four-dot ornament */}
          <div
            className={`mt-12 flex items-center justify-center transition-all duration-700 ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
            style={{ transitionDelay: "380ms" }}
            aria-hidden="true"
          >
            <span className="dot-ornament">
              <span /><span /><span /><span />
            </span>
          </div>

          {/* Subtext */}
          <p
            className={`mx-auto mt-12 max-w-xl text-[17px] leading-[1.6] transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
            style={{
              transitionDelay: "460ms",
              color: "hsl(28 6% 38%)",
            }}
          >
            The average outbound team spends 40% of its week on research. SalesOS
            cuts that to under twenty minutes — and every contact arrives with a
            verified email ready to send.
          </p>
        </div>
      </div>

      {/* Bottom hairline */}
      <div className="absolute bottom-0 left-0 right-0 hairline" />
    </section>
  );
};
