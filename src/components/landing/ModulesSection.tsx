import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const modules = [
  {
    number: "01",
    title: "Lead Discovery",
    tagline: "From ICP to ranked prospects in under 2 minutes.",
    description:
      "Describe who you want in plain English — title, industry, company size, buying signals. SalesOS returns verified contacts ranked by fit. No filters. No boolean syntax. No list-building.",
  },
  {
    number: "02",
    title: "Outreach Studio",
    tagline: "Context-aware email drafts you actually want to send.",
    description:
      "Each email is built from real company and contact context — news, growth signals, open roles. A quality checker flags issues before you hit send. Shuffle between angles in one click.",
  },
  {
    number: "03",
    title: "Reply Management",
    tagline: "Inbox zero for your email pipeline.",
    description:
      "Every response, tracked. Follow-up sequences that keep momentum after the first email lands. No prospect slips through because you forgot to check a separate inbox.",
  },
  {
    number: "04",
    title: "Pipeline & Analytics",
    tagline: "See what's moving. Know what to push.",
    description:
      "Understand where email threads are progressing, where outreach is stalling, and what to prioritize next week. Built for outbound teams — not enterprise dashboards with 40 tabs.",
  },
];

const alsoIncluded = [
  "Multi-step sequences",
  "Deliverability monitoring",
  "Sales coaching tools",
  "Zapier & API automation",
  "White-label client portal",
  "Agency reporting",
];

export const ModulesSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="features"
      className="relative py-24 md:py-36 overflow-hidden"
      style={{ background: "hsl(0,0%,3%)" }}
      aria-labelledby="modules-heading"
    >
      {/* Purple glow blob — center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 50%, hsl(261 75% 55% / 0.06) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />

      {/* Top hairline — purple tint */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "hsl(261 75% 50% / 0.18)" }}
      />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">

          {/* Header — left-aligned, editorial */}
          <div
            className={`mb-20 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <p
              className="text-[10px] uppercase tracking-[0.28em] mb-5 font-medium"
              style={{ color: "hsl(261 75% 60%)" }}
            >
              The Platform
            </p>
            <h2
              id="modules-heading"
              className="font-display"
              style={{
                fontSize: "clamp(2.4rem, 5vw, 4rem)",
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
                color: "hsl(0 0% 96%)",
              }}
            >
              Everything you need
              <br />
              <span
                style={{
                  background:
                    "linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 80% 68%) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  fontStyle: "italic",
                }}
              >
                to run outbound.
              </span>
            </h2>
          </div>

          {/* Module rows */}
          <div className="flex flex-col">
            {modules.map((mod, index) => (
              <div
                key={mod.number}
                className="group relative cursor-default"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {/* Top border — pulses to purple on hover */}
                <div
                  className="h-px transition-all duration-300"
                  style={{
                    background:
                      activeIndex === index
                        ? "linear-gradient(to right, hsl(261 75% 55% / 0.6), hsl(280 80% 60% / 0.3), transparent)"
                        : "hsl(261 75% 50% / 0.12)",
                  }}
                />

                <div
                  className={`flex flex-col md:flex-row md:items-start gap-6 py-9 transition-all duration-700 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${index * 100}ms` }}
                >
                  {/* Number — purple by default */}
                  <span
                    className="flex-shrink-0 font-mono text-sm transition-colors duration-300 w-10"
                    style={{
                      color:
                        activeIndex === index
                          ? "hsl(261 75% 65%)"
                          : "hsl(261 75% 50% / 0.5)",
                    }}
                  >
                    {mod.number}
                  </span>

                  {/* Title + tagline */}
                  <div className="flex-1 md:w-64 md:flex-none">
                    <h3
                      className="text-xl font-semibold mb-1 transition-colors duration-200"
                      style={{
                        color:
                          activeIndex === index
                            ? "hsl(0 0% 98%)"
                            : "hsl(0 0% 80%)",
                      }}
                    >
                      {mod.title}
                    </h3>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "hsl(261 75% 65% / 0.8)" }}
                    >
                      {mod.tagline}
                    </p>
                  </div>

                  {/* Description */}
                  <div
                    className="flex-1 transition-all duration-300"
                    style={{
                      opacity: activeIndex === index ? 1 : 0.4,
                    }}
                  >
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "hsl(0 0% 100% / 0.5)" }}
                    >
                      {mod.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {/* Bottom border */}
            <div
              className="h-px"
              style={{ background: "hsl(261 75% 50% / 0.12)" }}
            />
          </div>

          {/* Also included */}
          <div
            className={`mt-14 flex flex-col sm:flex-row sm:items-center gap-4 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: "500ms" }}
          >
            <p
              className="text-[10px] uppercase tracking-[0.2em] flex-shrink-0"
              style={{ color: "hsl(261 75% 55% / 0.5)" }}
            >
              Also included
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {alsoIncluded.map((item, i) => (
                <span
                  key={i}
                  className="text-xs"
                  style={{ color: "hsl(0 0% 100% / 0.35)" }}
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div
            className={`mt-14 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: "600ms" }}
          >
            <button
              onClick={() => navigate("/pricing")}
              className="inline-flex items-center gap-2 text-sm font-medium transition-colors duration-200"
              style={{ color: "hsl(261 75% 65%)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "hsl(261 75% 80%)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "hsl(261 75% 65%)")
              }
            >
              See plans and pricing →
            </button>
          </div>
        </div>
      </div>

      {/* Bottom hairline */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "hsl(261 75% 50% / 0.18)" }}
      />
    </section>
  );
};
