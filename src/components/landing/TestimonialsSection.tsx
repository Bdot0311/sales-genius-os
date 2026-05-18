import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ShieldCheck, Zap, Target } from "lucide-react";

// Honest early-stage social proof — no fake testimonials.
// Instead: a founding member pitch + a bold guarantee.

const FOUNDING_SPOTS_TOTAL = 100;
const FOUNDING_SPOTS_TAKEN = 34; // update this manually as you grow

const guarantees = [
  {
    Icon: Target,
    title: "Book a qualified demo in 30 days",
    body: "Follow the workflow — describe your ICP, review the ranked list, send the AI draft. If you don't book at least one qualified demo in your first 30 days, we'll refund every cent.",
  },
  {
    Icon: Zap,
    title: "Your first lead list in under 2 minutes",
    body: "Not 2 hours. Not tomorrow. The moment you describe your customer in plain English, SalesOS returns a ranked, verified prospect list. That's the whole promise — and it works on day one.",
  },
  {
    Icon: ShieldCheck,
    title: "No lock-in. Ever.",
    body: "Cancel any paid plan in one click, no questions asked. We don't bury the cancel button. If SalesOS isn't saving you time and closing deals, you shouldn't pay for it.",
  },
];

export const TestimonialsSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const navigate = useNavigate();
  const pctTaken = Math.round((FOUNDING_SPOTS_TAKEN / FOUNDING_SPOTS_TOTAL) * 100);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ background: "hsl(0,0%,3%)" }}
      aria-labelledby="founding-heading"
    >
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 50% at 50% 0%, hsl(261 75% 55% / 0.07) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />

      <div className="container relative z-10 mx-auto px-6">

        {/* ── Guarantees ── */}
        <div
          className={`text-center mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          <p className="text-[10px] font-medium uppercase tracking-[0.28em] mb-4" style={{ color: "hsl(261 75% 60%)" }}>
            Our commitments
          </p>
          <h2
            id="founding-heading"
            className="font-display text-balance"
            style={{ fontSize: "clamp(1.75rem, 4vw, 3rem)", fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 92%)" }}
          >
            We put our money where our mouth is.
          </h2>
          <p className="mt-4 text-base text-white/40 max-w-md mx-auto">
            Early-stage product. Real guarantees. No asterisks.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto mb-20">
          {guarantees.map(({ Icon, title, body }, i) => (
            <div
              key={title}
              className="rounded-2xl p-7 transition-all duration-700"
              style={{
                background: "hsl(0 0% 100% / 0.03)",
                border: "1px solid hsl(261 75% 50% / 0.15)",
                transitionDelay: `${i * 80}ms`,
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(16px)",
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center mb-5"
                style={{ background: "hsl(261 75% 50% / 0.15)", border: "1px solid hsl(261 75% 50% / 0.25)" }}
              >
                <Icon className="w-4 h-4" style={{ color: "hsl(261 75% 68%)" }} />
              </div>
              <h3 className="text-sm font-bold mb-3" style={{ color: "hsl(0 0% 88%)" }}>{title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.65)" }}>{body}</p>
            </div>
          ))}
        </div>

        {/* ── Founding Members ── */}
        <div
          className={`max-w-2xl mx-auto transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <div
            className="rounded-2xl p-8 md:p-10 text-center"
            style={{
              background: "hsl(261 75% 50% / 0.08)",
              border: "1px solid hsl(261 75% 50% / 0.3)",
              boxShadow: "0 0 60px hsl(261 75% 50% / 0.1)",
            }}
          >
            {/* Founding badge */}
            <div
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-6 text-[10px] font-semibold"
              style={{
                background: "linear-gradient(135deg, hsl(261 75% 55%), hsl(280 80% 65%))",
                color: "white",
              }}
            >
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
              </span>
              Founding Member Offer — {FOUNDING_SPOTS_TOTAL - FOUNDING_SPOTS_TAKEN} spots left
            </div>

            <h3
              className="font-display mb-4"
              style={{ fontSize: "clamp(1.4rem, 3.5vw, 2.2rem)", fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 93%)" }}
            >
              Lock in 40% off. Forever.
            </h3>
            <p className="text-sm leading-relaxed mb-6 max-w-md mx-auto" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
              The first {FOUNDING_SPOTS_TOTAL} customers get founding-member pricing — locked in for life, never raised.
              {" "}<span style={{ color: "hsl(261 75% 70%)" }}>{FOUNDING_SPOTS_TAKEN} of {FOUNDING_SPOTS_TOTAL} spots claimed.</span>
            </p>

            {/* Progress bar */}
            <div className="mb-6 mx-auto max-w-xs">
              <div className="flex justify-between text-[10px] mb-1.5" style={{ color: "hsl(0 0% 100% / 0.35)" }}>
                <span>{FOUNDING_SPOTS_TAKEN} claimed</span>
                <span>{FOUNDING_SPOTS_TOTAL - FOUNDING_SPOTS_TAKEN} remaining</span>
              </div>
              <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "hsl(0 0% 100% / 0.08)" }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: isVisible ? `${pctTaken}%` : "0%",
                    background: "linear-gradient(to right, hsl(261 75% 55%), hsl(280 80% 65%))",
                    transitionDelay: "600ms",
                  }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="inline-flex items-center gap-2 rounded-full px-8 py-3.5 text-sm font-semibold text-white group transition-opacity duration-200 hover:opacity-90"
              style={{
                background: "linear-gradient(135deg, hsl(261 75% 58%), hsl(261 75% 47%))",
                boxShadow: "0 0 30px hsl(261 75% 50% / 0.35)",
              }}
            >
              Claim my founding spot
              <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            <p className="mt-3 text-[10px]" style={{ color: "hsl(0 0% 100% / 0.25)" }}>
              Free plan available — no credit card required
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.12)" }} />
    </section>
  );
};
