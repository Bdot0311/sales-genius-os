import { useEffect, useRef, useState } from "react";

export const BigStatSection = () => {
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
      className="relative py-28 md:py-44 overflow-hidden"
      style={{
        background: "hsl(0,0%,3%)",
        borderTop: "1px solid hsl(261 75% 50% / 0.18)",
        borderBottom: "1px solid hsl(261 75% 50% / 0.18)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 60% at 50% 50%, hsl(261 75% 55% / 0.1) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-6 max-w-3xl relative z-10">
        <div className="flex flex-col items-center text-center">

          <p
            className={`text-[10px] uppercase tracking-[0.28em] mb-5 font-medium text-center text-purple-500 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          >
            The benchmark
          </p>

          <p
            className={`font-display italic leading-none mb-8 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            style={{
              fontSize: "clamp(5.5rem, 20vw, 14rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "hsl(261 75% 65%)",
              transitionDelay: "80ms",
            }}
          >
            {"< 2 min"}
          </p>

          <p
            className={`text-lg font-light max-w-xs mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ color: "hsl(0 0% 100% / 0.4)", lineHeight: 1.6, transitionDelay: "160ms" }}
          >
            From ICP to first email sent. No tab-switching.
          </p>

          <div
            className={`flex flex-col sm:flex-row items-center gap-6 sm:gap-12 transition-all duration-700 ${isVisible ? "opacity-100" : "opacity-0"}`}
            style={{ transitionDelay: "280ms" }}
          >
            <div className="text-center">
              <span
                className="block font-display font-bold"
                style={{ fontSize: "1.75rem", color: "hsl(0 0% 78%)", letterSpacing: "-0.02em" }}
              >
                10.7%
              </span>
              <span
                className="block text-xs mt-1"
                style={{ color: "hsl(0 0% 100% / 0.28)" }}
              >
                reply rate on signal sequences
              </span>
            </div>

            <div
              className="hidden sm:block w-px h-12"
              style={{ background: "hsl(261 75% 50% / 0.18)" }}
            />

            <div className="text-center">
              <span
                className="block font-display font-bold"
                style={{ fontSize: "1.75rem", color: "hsl(0 0% 78%)", letterSpacing: "-0.02em" }}
              >
                1 tool
              </span>
              <span
                className="block text-xs mt-1"
                style={{ color: "hsl(0 0% 100% / 0.28)" }}
              >
                instead of Apollo + Clay + Gmail + spreadsheet
              </span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
