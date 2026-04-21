import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Describe your customer once.",
    body:
      "Type who you want in plain English — title, industry, company size, location, hiring signals. No filters. No boolean. Just intent.",
    visual: (
      <div
        className="mt-6 rounded-xl px-5 py-4 font-mono text-[13px] leading-relaxed"
        style={{
          background: "hsl(34 40% 98%)",
          border: "1px solid hsl(28 10% 88%)",
          color: "hsl(28 10% 14%)",
        }}
      >
        <span style={{ color: "hsl(14 59% 52%)" }} className="mr-2 select-none">
          &gt;
        </span>
        "VP of Sales at Series B SaaS companies in the US, 50–200 employees,
        actively hiring SDRs"
      </div>
    ),
  },
  {
    number: "02",
    title: "Review who's actually worth emailing.",
    body:
      "Your prospects come back ranked by ICP fit with verified business emails. Match score, company context, and open job signals — before you write a word.",
    visual: (
      <div
        className="mt-6 overflow-hidden rounded-xl"
        style={{
          background: "hsl(34 40% 98%)",
          border: "1px solid hsl(28 10% 88%)",
        }}
      >
        {[
          { name: "Jordan Park", role: "Head of Sales · Northline", fit: 94 },
          { name: "Rina Shah", role: "VP Revenue · SignalFox", fit: 88 },
          { name: "Alex Müller", role: "Dir. of Sales · GraphiteIQ", fit: 81 },
        ].map(({ name, role, fit }, i) => (
          <div
            key={name}
            className="flex items-center justify-between gap-4 px-5 py-3.5"
            style={{
              borderBottom: i < 2 ? "1px solid hsl(28 10% 90%)" : undefined,
            }}
          >
            <div>
              <p className="text-sm font-medium" style={{ color: "hsl(28 10% 14%)" }}>
                {name}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "hsl(28 6% 48%)" }}>
                {role}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2.5">
              <div
                className="h-1 w-14 overflow-hidden rounded-full"
                style={{ background: "hsl(28 10% 90%)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${fit}%`, background: "hsl(14 59% 59%)" }}
                />
              </div>
              <span
                className="font-mono text-xs font-medium tabular-nums"
                style={{ color: "hsl(14 59% 52%)" }}
              >
                {fit}%
              </span>
            </div>
          </div>
        ))}
        <div
          className="flex items-center gap-1.5 px-5 py-2.5"
          style={{ borderTop: "1px solid hsl(28 10% 90%)", background: "hsl(34 33% 96%)" }}
        >
          <span style={{ color: "hsl(142 45% 42%)", fontSize: "10px" }}>✓</span>
          <span className="font-mono text-[10px]" style={{ color: "hsl(28 6% 48%)" }}>
            SMTP-verified · multi-source enrichment
          </span>
        </div>
      </div>
    ),
  },
  {
    number: "03",
    title: "Send something worth reading.",
    body:
      "SalesOS drafts a first-touch email from the prospect's real context — company news, role, growth signals. Edit it in thirty seconds and ship.",
    visual: (
      <div
        className="mt-6 overflow-hidden rounded-xl"
        style={{
          background: "hsl(34 40% 98%)",
          border: "1px solid hsl(28 10% 88%)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid hsl(28 10% 90%)" }}
        >
          <span className="eyebrow">AI draft</span>
          <span
            className="rounded-full px-2 py-0.5 font-mono text-[10px] font-medium"
            style={{
              background: "hsl(142 30% 92%)",
              border: "1px solid hsl(142 30% 80%)",
              color: "hsl(142 45% 32%)",
            }}
          >
            Quality check passed
          </span>
        </div>
        <div className="space-y-2 px-5 py-4">
          <p className="font-mono text-[11px]" style={{ color: "hsl(28 6% 48%)" }}>
            Subject: Quick idea for Northline's outbound push
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "hsl(28 10% 24%)" }}>
            Hey Jordan — saw Northline is scaling the sales team in NYC and hiring
            SDRs right now. That usually means more pressure to build pipeline
            fast…
          </p>
        </div>
      </div>
    ),
  },
];

export const HowItWorks = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="relative overflow-hidden py-24 sm:py-32"
      style={{ background: "hsl(34 33% 96%)" }}
      aria-labelledby="how-it-works-heading"
    >
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative z-10 mx-auto max-w-[1120px] px-6 sm:px-8">
        {/* Eyebrow */}
        <div className="mb-8 flex items-center gap-3">
          <span className="eyebrow">02 / Method</span>
          <span className="hairline w-12" />
          <span className="eyebrow-muted">How it works</span>
        </div>

        {/* Headline */}
        <h2
          id="how-it-works-heading"
          className={`font-display mb-20 max-w-3xl transition-all duration-700 ${
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
          Three steps.{" "}
          <span className="italic" style={{ color: "hsl(14 59% 52%)", fontWeight: 500 }}>
            One workflow.
          </span>
        </h2>

        {/* Step list — editorial 2-col rhythm */}
        <div className="flex flex-col">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`relative border-t py-10 sm:py-14 scroll-reveal ${isVisible ? "visible" : ""}`}
              style={
                {
                  "--reveal-delay": `${index * 120}ms`,
                  borderColor: "hsl(28 10% 88%)",
                } as React.CSSProperties
              }
            >
              <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-10">
                {/* Left: number + title */}
                <div className="md:col-span-5">
                  <div className="flex items-center gap-3">
                    <span className="eyebrow">{step.number}</span>
                    <span className="hairline w-10" />
                  </div>
                  <h3
                    className="font-display mt-4"
                    style={{
                      fontSize: "clamp(1.5rem, 2.6vw, 2.1rem)",
                      fontWeight: 400,
                      lineHeight: 1.15,
                      letterSpacing: "-0.02em",
                      color: "hsl(28 10% 14%)",
                    }}
                  >
                    {step.title}
                  </h3>
                </div>

                {/* Right: body + visual */}
                <div className="md:col-span-7">
                  <p
                    className="max-w-xl text-[16px] leading-[1.65]"
                    style={{ color: "hsl(28 6% 38%)" }}
                  >
                    {step.body}
                  </p>
                  {step.visual}
                </div>
              </div>
            </div>
          ))}

          {/* Closing rule */}
          <div className="hairline" />
        </div>

        {/* CTA */}
        <div
          className={`mt-14 scroll-reveal ${isVisible ? "visible" : ""}`}
          style={{ "--reveal-delay": "420ms" } as React.CSSProperties}
        >
          <button
            onClick={() => navigate("/auth")}
            className="cta-ghost inline-flex items-center gap-1.5 text-[15px] font-medium"
          >
            Try it with your own ICP
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 hairline" />
    </section>
  );
};
