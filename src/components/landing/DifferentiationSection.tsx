import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const rows = [
  {
    legacy: "1,000 raw contacts and a spreadsheet",
    truth: "Ranked prospects scored by ICP fit",
  },
  {
    legacy: "Boolean search that takes 45 minutes to configure",
    truth: "Plain English. Leads in under two minutes.",
  },
  {
    legacy: "A data tool that stops at the export",
    truth: "From search to sent email in one workflow",
  },
  {
    legacy: "$500/mo for data you still have to manually qualify",
    truth: "Scoring, enrichment, and outreach included",
  },
];

export const DifferentiationSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

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
      aria-labelledby="differentiation-heading"
    >
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative z-10 mx-auto max-w-[1120px] px-6 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex items-center gap-3">
            <span className="eyebrow">04 / vs Apollo</span>
            <span className="hairline w-12" />
          </div>

          <h2
            id="differentiation-heading"
            className={`font-display mb-16 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
            style={{
              fontSize: "clamp(2.2rem, 5vw, 3.75rem)",
              fontWeight: 400,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              color: "hsl(28 10% 14%)",
            }}
          >
            Apollo sells you contacts.{" "}
            <span className="italic" style={{ color: "hsl(14 59% 52%)", fontWeight: 500 }}>
              We show you who to email next.
            </span>
          </h2>

          <div className="flex flex-col">
            {rows.map((row, index) => (
              <div
                key={index}
                className={`grid grid-cols-12 items-center gap-4 border-t py-6 transition-all duration-700 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                }`}
                style={{
                  transitionDelay: `${index * 80 + 160}ms`,
                  borderColor: "hsl(28 10% 88%)",
                }}
              >
                <span
                  className="col-span-12 text-[15px] leading-relaxed line-through sm:col-span-5"
                  style={{ color: "hsl(28 6% 60%)" }}
                >
                  {row.legacy}
                </span>

                <ArrowRight
                  className="col-span-12 hidden h-4 w-4 sm:col-span-1 sm:block"
                  style={{ color: "hsl(14 59% 52%)" }}
                  aria-hidden="true"
                />

                <span
                  className="col-span-12 text-[16px] font-medium leading-relaxed sm:col-span-6"
                  style={{ color: "hsl(28 10% 14%)" }}
                >
                  {row.truth}
                </span>
              </div>
            ))}
            <div className="hairline" />
          </div>

          <div
            className={`mt-12 flex flex-col items-start gap-3 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
            style={{ transitionDelay: "500ms" }}
          >
            <button
              onClick={() => navigate("/pricing")}
              className="inline-flex h-[52px] items-center gap-2 rounded-full border px-7 text-[15px] font-medium transition-colors duration-200 group"
              style={{
                borderColor: "hsl(28 10% 22%)",
                color: "hsl(28 10% 14%)",
                background: "transparent",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "hsl(14 59% 52%)";
                e.currentTarget.style.color = "hsl(14 59% 52%)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "hsl(28 10% 22%)";
                e.currentTarget.style.color = "hsl(28 10% 14%)";
              }}
            >
              See how it stacks up
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
            <p className="text-sm" style={{ color: "hsl(28 6% 48%)" }}>
              No credit card · Cancel anytime
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 hairline" />
    </section>
  );
};
