import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const steps = [
  {
    number: "01",
    title: "Describe your customer once.",
    body: "Type who you want in plain English — title, industry, company size, location, hiring signals. No filters. No boolean. Just intent.",
    visual: (
      <div className="mt-4 rounded-md border border-border/40 bg-muted/30 px-4 py-3 font-mono text-sm text-muted-foreground leading-relaxed">
        <span className="text-primary/60 select-none mr-2">{">"}</span>
        "VP of Sales at Series B SaaS companies in the US, 50–200 employees, actively hiring SDRs"
      </div>
    ),
  },
  {
    number: "02",
    title: "Review who's actually worth calling.",
    body: "Your prospects come back ranked by ICP fit with verified contact data. You see match score, company context, and open job signals before you dial.",
    visual: null,
  },
  {
    number: "03",
    title: "Send something worth reading.",
    body: "SalesOS drafts a first-touch email from the prospect's actual context — company news, role, growth signals. Edit it in 30 seconds and ship.",
    visual: null,
  },
];

export const HowItWorks = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="relative py-24 md:py-32 overflow-hidden"
      aria-labelledby="how-it-works-heading"
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px]"
          style={{
            background:
              "radial-gradient(ellipse at center, hsl(261 75% 50% / 0.06) 0%, transparent 60%)",
          }}
          aria-hidden="true"
        />
      </div>

      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[720px]">
          {/* Headline — left-aligned, no badge, no subheadline */}
          <h2
            id="how-it-works-heading"
            className={`text-4xl sm:text-5xl font-bold tracking-tight max-w-xl mb-16 scroll-reveal ${isVisible ? "visible" : ""}`}
          >
            Three steps.
            <br />
            One workflow.
          </h2>

          {/* Step list */}
          <div className="flex flex-col">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`relative border-b border-border/15 py-10 scroll-reveal ${isVisible ? "visible" : ""}`}
                style={
                  { "--reveal-delay": `${index * 140}ms` } as React.CSSProperties
                }
              >
                {/* Large faded background number */}
                <span
                  className="absolute top-4 right-0 text-8xl font-bold text-muted-foreground/10 leading-none select-none pointer-events-none"
                  aria-hidden="true"
                >
                  {step.number}
                </span>

                {/* Step content with left border accent */}
                <div className="relative border-l-2 border-primary/30 pl-6">
                  <p className="text-xs font-mono text-primary/50 tracking-widest mb-3 uppercase">
                    {step.number}
                  </p>
                  <h3 className="text-2xl font-semibold mb-3 leading-snug">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed max-w-lg">
                    {step.body}
                  </p>
                  {step.visual}
                </div>
              </div>
            ))}
          </div>

          {/* Bottom CTA */}
          <div
            className={`pt-10 scroll-reveal ${isVisible ? "visible" : ""}`}
            style={{ "--reveal-delay": "420ms" } as React.CSSProperties}
          >
            <button
              onClick={() => navigate("/auth")}
              className="text-primary hover:underline underline-offset-4 text-sm font-medium transition-colors"
            >
              Try it with your own ICP &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
