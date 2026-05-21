import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { SEOHead } from "@/components/seo";

// ─── Keyframes ────────────────────────────────────────────────────────────────
const GLOBAL_STYLES = `
  @keyframes drift {
    0%   { transform: translate(0,0) scale(1); }
    33%  { transform: translate(18px,-22px) scale(1.05); }
    66%  { transform: translate(-12px,14px) scale(0.97); }
    100% { transform: translate(0,0) scale(1); }
  }
  @keyframes shimmer-sweep {
    0%   { transform: translateX(-100%) skewX(-12deg); }
    100% { transform: translateX(300%)  skewX(-12deg); }
  }
  @keyframes scan-line {
    0%   { top: 0%;   opacity: 0.9; }
    90%  { top: 100%; opacity: 0.9; }
    100% { top: 100%; opacity: 0; }
  }
  @keyframes word-rise {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes counter-blur-in {
    from { filter: blur(8px); opacity: 0; transform: scale(0.85); }
    to   { filter: blur(0);   opacity: 1; transform: scale(1); }
  }
  @keyframes breathe {
    0%,100% { opacity: 0.5; transform: scale(1); }
    50%     { opacity: 1;   transform: scale(1.15); }
  }
  @keyframes chevron-bounce {
    0%,100% { transform: translateY(0); }
    50%     { transform: translateY(6px); }
  }
  @keyframes hero-orb-demo {
    0%,100% { transform: translate(0,0) scale(1); }
    50%     { transform: translate(14px,-18px) scale(1.04); }
  }
  .animate-breathe { animation: breathe 1.6s ease-in-out infinite; }
`;

const useGlobalStyles = () => {
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = GLOBAL_STYLES;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
};

// ─── Gradient text helper ─────────────────────────────────────────────────────
const GradText = ({ children }: { children: React.ReactNode }) => (
  <span
    className="font-display italic animate-shiny"
    style={{
      backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
      backgroundSize: "200% auto",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      filter: "url(#c3-noise)",
    }}
  >
    {children}
  </span>
);

// ─── Easing ───────────────────────────────────────────────────────────────────
const easeOut3 = (t: number) => 1 - Math.pow(1 - t, 3);
const norm = (v: number, lo: number, hi: number) =>
  Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

// ─── MeltContainer ────────────────────────────────────────────────────────────
// Three-phase fixed pinning using getBoundingClientRect() — immune to ancestor
// overflow:hidden because position:fixed escapes all containing blocks.
// before  → position:absolute top:0    (scroll budget not yet reached)
// active  → position:fixed   top:0     (locked to viewport, GPU-composited)
// after   → position:absolute bottom:0 (anchored to bottom of scroll space)
// Progress = -rect.top / (outerHeight - viewportHeight), always 0→1.
const MELT_FADE = 0.05;

const MeltContainer = ({
  chapters,
}: {
  chapters: Array<{
    render: (active: boolean) => React.ReactNode;
    glowPos: string;
  }>;
}) => {
  const outerRef = useRef<HTMLDivElement>(null);
  const rafRef   = useRef<number>(0);
  const N = chapters.length;

  type Phase = "before" | "active" | "after";
  const [phase, setPhase]       = useState<Phase>("before");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const outer = outerRef.current;
      if (!outer) return;
      const rect = outer.getBoundingClientRect();
      const scrollable = outer.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;

      if (rect.top > 0) {
        setPhase("before");
        setProgress(0);
      } else if (rect.bottom <= window.innerHeight) {
        setPhase("after");
        setProgress(1);
      } else {
        setPhase("active");
        setProgress(Math.max(0, Math.min(1, -rect.top / scrollable)));
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const boundaries = Array.from({ length: N - 1 }, (_, i) => (i + 1) / N);

  const getFadeIn = (i: number) =>
    i === 0 ? 1 : easeOut3(norm(progress, boundaries[i - 1] - MELT_FADE, boundaries[i - 1] + MELT_FADE));
  const getFadeOut = (i: number) =>
    i === N - 1 ? 0 : easeOut3(norm(progress, boundaries[i] - MELT_FADE, boundaries[i] + MELT_FADE));

  const activeIdx = boundaries.reduce((acc, b) => (progress >= b - MELT_FADE ? acc + 1 : acc), 0);

  const viewportStyle: React.CSSProperties =
    phase === "active"
      ? { position: "fixed",    top: 0, left: 0, right: 0, height: "100vh" }
      : phase === "after"
      ? { position: "absolute", bottom: 0, left: 0, right: 0, height: "100vh" }
      : { position: "absolute", top: 0,    left: 0, right: 0, height: "100vh" };

  return (
    <div
      ref={outerRef}
      style={{ height: `${N * 120}vh`, position: "relative" }}
    >
      <div
        style={{
          ...viewportStyle,
          overflow: "hidden",
          background: "hsl(261 75% 2%)",
        }}
      >
        {/* Dot grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(0 0% 100% / 0.045) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
          aria-hidden="true"
        />

        {chapters.map(({ render, glowPos }, i) => {
          const fadeIn  = getFadeIn(i);
          const fadeOut = getFadeOut(i);
          const opacity = Math.max(0, Math.min(1, fadeIn - fadeOut));
          const ty      = (1 - fadeIn) * 60 - fadeOut * 60;
          const scale   = 0.93 + opacity * 0.07;
          const blur    = (1 - opacity) * 12;
          const active  = opacity > 0.45;

          return (
            <div
              key={i}
              aria-hidden={!active}
              style={{
                position: "absolute",
                inset: 0,
                opacity,
                transform: `translateY(${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`,
                filter: blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : "none",
                willChange: "opacity, transform, filter",
                pointerEvents: active ? "auto" : "none",
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse 55% 55% at ${glowPos}, hsl(261 75% 55% / 0.15), transparent 65%)`,
                  filter: "blur(24px)",
                  opacity: Math.max(0, opacity * 0.95),
                }}
                aria-hidden="true"
              />
              {render(active)}
            </div>
          );
        })}

        {/* Dot indicator */}
        <div
          className="absolute bottom-7 left-1/2 -translate-x-1/2 flex items-center gap-2.5 z-20"
          aria-hidden="true"
        >
          {chapters.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all duration-500"
              style={{
                width:  activeIdx === i ? "20px" : "5px",
                height: "5px",
                background: activeIdx === i ? "hsl(261 75% 65%)" : "hsl(0 0% 100% / 0.18)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Primitives ───────────────────────────────────────────────────────────────
const Counter = ({ to, prefix = "", suffix = "", active }: { to: number; prefix?: string; suffix?: string; active: boolean }) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    const dur = 1600;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active, to]);
  return <>{prefix}{val}{suffix}</>;
};

const Typewriter = ({ text, active, speed = 16 }: { text: string; active: boolean; speed?: number }) => {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!active) { setTyped(""); return; }
    const delay = setTimeout(() => {
      let i = 0;
      const t = setInterval(() => {
        if (i < text.length) { setTyped(text.slice(0, i + 1)); i++; }
        else clearInterval(t);
      }, speed);
      return () => clearInterval(t);
    }, 100);
    return () => clearTimeout(delay);
  }, [active, text, speed]);
  return (
    <>
      {typed}
      {active && typed.length < text.length && (
        <span className="inline-block w-[2px] h-[0.9em] align-middle ml-0.5 animate-breathe"
          style={{ background: "hsl(261 75% 65%)" }} />
      )}
    </>
  );
};

// Section label — matches landing page pattern exactly
const SectionLabel = ({ num, label, visible }: { num: string; label: string; visible: boolean }) => (
  <div
    className="flex items-center gap-3 mb-7"
    style={{
      animation: visible ? "word-rise 0.42s cubic-bezier(0.22,1,0.36,1) both" : "none",
      opacity: visible ? undefined : 0,
    }}
  >
    <span
      className="font-mono text-xs tracking-[0.2em]"
      style={{ color: "hsl(261 75% 60% / 0.55)" }}
    >
      {num}
    </span>
    <div className="w-8 h-px" style={{ background: "hsl(261 75% 55% / 0.3)" }} />
    <span
      className="text-[10px] uppercase tracking-[0.22em] font-medium"
      style={{ color: "hsl(261 75% 60%)" }}
    >
      {label}
    </span>
  </div>
);

// Glass card — darkened to match landing's dark-card aesthetic
const GlassCard = ({
  children, className = "", active = false,
}: {
  children: React.ReactNode; className?: string; active?: boolean;
}) => (
  <div
    className={`relative rounded-2xl overflow-hidden ${className}`}
    style={{
      background: "hsl(261 75% 4% / 0.9)",
      border: `1px solid ${active ? "hsl(261 75% 50% / 0.22)" : "hsl(261 75% 50% / 0.12)"}`,
      boxShadow: active
        ? "0 0 40px hsl(261 75% 55% / 0.1), 0 24px 80px rgba(0,0,0,0.5)"
        : "0 16px 60px rgba(0,0,0,0.35)",
      transition: "box-shadow 0.7s ease, border-color 0.5s ease",
    }}
  >
    {active && (
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: "linear-gradient(105deg, transparent 28%, rgba(255,255,255,0.03) 50%, transparent 72%)",
          animation: "shimmer-sweep 1.8s ease-in-out 0.22s 1 both",
        }}
        aria-hidden="true"
      />
    )}
    {/* Top hairline — matches landing */}
    <div
      className="absolute top-0 left-0 right-0 h-px pointer-events-none"
      style={{ background: "linear-gradient(90deg, transparent, hsl(261 75% 65% / 0.3), transparent)" }}
      aria-hidden="true"
    />
    {children}
  </div>
);

// ─── Chapter 1: Search ────────────────────────────────────────────────────────
const SearchChapter = ({ active }: { active: boolean }) => (
  <div className="flex h-full items-center">
    <div className="w-full max-w-7xl mx-auto px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
      {/* Left: copy */}
      <div className="relative">
        <div
          className="absolute -top-10 -left-2 leading-none select-none pointer-events-none"
          style={{ fontSize: "clamp(5rem, 12vw, 9rem)", fontWeight: 800, color: "hsl(261 75% 50% / 0.04)" }}
          aria-hidden="true"
        >
          01
        </div>
        <SectionLabel num="01" label="Search" visible={active} />
        <h2
          className="font-display mb-6"
          style={{
            fontSize: "clamp(2.6rem, 6vw, 4.8rem)",
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            color: "hsl(0 0% 95%)",
            animation: active ? "word-rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          Describe who<br />
          <span className="italic">
            <GradText>you want to reach.</GradText>
          </span>
        </h2>
        <p
          className="text-base md:text-lg leading-relaxed max-w-sm"
          style={{
            color: "hsl(0 0% 100% / 0.42)",
            animation: active ? "word-rise 0.5s cubic-bezier(0.22,1,0.36,1) 0.18s both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          No Boolean filters. No field juggling. Just plain-English targeting.
        </p>
      </div>

      {/* Right: UI card */}
      <div
        style={{
          animation: active ? "word-rise 0.5s cubic-bezier(0.22,1,0.36,1) 0.08s both" : "none",
          opacity: active ? undefined : 0,
        }}
      >
        <GlassCard active={active}>
          {active && (
            <div
              className="absolute left-0 right-0 h-px pointer-events-none z-20"
              style={{
                background: "linear-gradient(90deg, transparent, hsl(261 75% 65% / 0.7), transparent)",
                animation: "scan-line 2.5s ease-in-out 0.6s 1 both",
              }}
              aria-hidden="true"
            />
          )}
          {/* Card header */}
          <div className="flex items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid hsl(0 0% 100% / 0.07)" }}>
            {["hsl(0 75% 50% / 0.35)", "hsl(45 90% 50% / 0.35)", "hsl(130 60% 45% / 0.35)"].map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
            ))}
            <span className="ml-3 text-[11px] font-mono tracking-wider" style={{ color: "hsl(0 0% 100% / 0.22)" }}>ICP Builder</span>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-breathe" style={{ background: "hsl(261 75% 65%)" }} />
              <span className="text-[10px]" style={{ color: "hsl(261 75% 65% / 0.7)" }}>AI active</span>
            </div>
          </div>
          <div className="p-6 md:p-8 space-y-5">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: "hsl(261 75% 60% / 0.7)", opacity: active ? 1 : 0, transition: "opacity 0.4s 0.3s" }}
            >
              Describe your ideal customer
            </div>
            <div
              className="rounded-xl p-5 min-h-[88px]"
              style={{
                background: "hsl(261 75% 50% / 0.05)",
                border: `1px solid ${active ? "hsl(261 75% 50% / 0.22)" : "hsl(0 0% 100% / 0.06)"}`,
                transition: "border-color 0.6s",
              }}
            >
              <div className="text-lg md:text-xl font-medium leading-relaxed" style={{ color: "hsl(0 0% 88%)" }}>
                <Typewriter text="Heads of Sales at NYC B2B SaaS companies with 10–100 employees hiring SDRs" active={active} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Title", "Industry", "Company size", "Location", "Hiring signal"].map((tag, i) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: "hsl(261 75% 50% / 0.07)",
                    border: "1px solid hsl(261 75% 50% / 0.18)",
                    color: "hsl(261 75% 72% / 0.8)",
                    opacity: active ? 1 : 0,
                    transform: active ? "translateY(0) scale(1)" : "translateY(5px) scale(0.96)",
                    transition: `opacity 0.22s ${120 + i * 28}ms, transform 0.22s ${120 + i * 28}ms`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <div style={{ opacity: active ? 1 : 0, transform: active ? "translateY(0)" : "translateY(5px)", transition: "all 0.24s 220ms" }}>
              <div className="flex items-center justify-between text-xs mb-2" style={{ color: "hsl(0 0% 100% / 0.28)" }}>
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full animate-breathe" style={{ background: "hsl(261 75% 65%)" }} />
                  Scanning database
                </span>
                <span className="font-semibold" style={{ color: "hsl(261 75% 65%)" }}>847 matches</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden" style={{ background: "hsl(0 0% 100% / 0.06)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: active ? "100%" : "0%",
                    background: "linear-gradient(90deg, hsl(261 75% 55%), hsl(280 80% 65%))",
                    transition: "width 0.75s cubic-bezier(0.22,1,0.36,1) 380ms",
                  }}
                />
              </div>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  </div>
);

// ─── Chapter 2: Leads ─────────────────────────────────────────────────────────
const leadsData = [
  { name: "Jordan Park",  meta: "Head of Sales · Northline",      fit: 94, delay: 0   },
  { name: "Rina Shah",    meta: "VP Revenue · SignalFox",          fit: 88, delay: 110 },
  { name: "Alex Müller",  meta: "Director of Sales · GraphiteIQ", fit: 81, delay: 220 },
];

const LeadsChapter = ({ active }: { active: boolean }) => (
  <div className="flex h-full items-center">
    <div className="w-full max-w-7xl mx-auto px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
      {/* Left: lead cards */}
      <div className="space-y-3">
        {leadsData.map(({ name, meta, fit, delay }) => (
          <div
            key={name}
            style={{
              animation: active ? `word-rise 0.4s cubic-bezier(0.22,1,0.36,1) ${delay}ms both` : "none",
              opacity: active ? undefined : 0,
            }}
          >
            <GlassCard active={active} className="px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-lg font-semibold" style={{ color: "hsl(0 0% 92%)" }}>{name}</div>
                <div className="text-sm mt-0.5" style={{ color: "hsl(0 0% 100% / 0.38)" }}>{meta}</div>
              </div>
              {/* ICP fit bar — matches HowItWorks step 2 */}
              <div className="flex items-center gap-2.5 flex-shrink-0">
                <div className="h-1 w-14 rounded-full overflow-hidden" style={{ background: "hsl(0 0% 100% / 0.08)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: active ? `${fit}%` : "0%",
                      background: "linear-gradient(to right, hsl(261 75% 55%), hsl(280 80% 65%))",
                      transition: `width 0.7s cubic-bezier(0.22,1,0.36,1) ${delay + 200}ms`,
                    }}
                  />
                </div>
                <span className="text-xs font-semibold w-8 text-right" style={{ color: "hsl(261 75% 68%)" }}>{fit}%</span>
              </div>
            </GlassCard>
          </div>
        ))}
        {/* SMTP badge — matches HowItWorks */}
        <div
          className="flex items-center gap-1.5 px-2 py-2"
          style={{ opacity: active ? 1 : 0, transition: "opacity 0.5s 0.5s" }}
        >
          <span style={{ color: "hsl(261 75% 62%)", fontSize: "10px" }}>✓</span>
          <span className="text-[10px]" style={{ color: "hsl(0 0% 100% / 0.22)" }}>
            Business emails verified via SMTP + multi-source enrichment
          </span>
        </div>
      </div>

      {/* Right: copy */}
      <div className="relative">
        <div
          className="absolute -top-10 -right-2 leading-none select-none pointer-events-none text-right"
          style={{ fontSize: "clamp(5rem, 12vw, 9rem)", fontWeight: 800, color: "hsl(261 75% 50% / 0.04)" }}
          aria-hidden="true"
        >
          02
        </div>
        <SectionLabel num="02" label="Leads" visible={active} />
        <h2
          className="font-display mb-6"
          style={{
            fontSize: "clamp(2.6rem, 6vw, 4.8rem)",
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            color: "hsl(0 0% 95%)",
            animation: active ? "word-rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          The right accounts<br />
          <span className="italic">
            <GradText>surface first.</GradText>
          </span>
        </h2>
        <p
          className="text-base md:text-lg leading-relaxed max-w-sm"
          style={{
            color: "hsl(0 0% 100% / 0.42)",
            animation: active ? "word-rise 0.5s cubic-bezier(0.22,1,0.36,1) 0.18s both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          Not a massive list. A tighter one ranked by ICP fit — so you know who to email first.
        </p>
      </div>
    </div>
  </div>
);

// ─── Chapter 3: Outreach ──────────────────────────────────────────────────────
const outreachLines = [
  "Hey Jordan — noticed Northline is hiring SDRs and growing the sales team in NYC.",
  "That usually means more pressure to build a repeatable prospecting workflow fast.",
  "SalesOS helps teams find better-fit leads and move into outreach in a single session.",
];

const OutreachChapter = ({ active }: { active: boolean }) => {
  const [visibleLines, setVisibleLines] = useState(0);
  useEffect(() => {
    if (!active) { setVisibleLines(0); return; }
    let i = 0;
    const t = setInterval(() => { i++; setVisibleLines(i); if (i >= outreachLines.length) clearInterval(t); }, 120);
    return () => clearInterval(t);
  }, [active]);

  return (
    <div className="flex h-full items-center">
      <div className="w-full max-w-7xl mx-auto px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
        {/* Left: copy */}
        <div className="relative">
          <div
            className="absolute -top-10 -left-2 leading-none select-none pointer-events-none"
            style={{ fontSize: "clamp(5rem, 12vw, 9rem)", fontWeight: 800, color: "hsl(261 75% 50% / 0.04)" }}
            aria-hidden="true"
          >
            03
          </div>
          <SectionLabel num="03" label="Outreach" visible={active} />
          <h2
            className="font-display mb-6"
            style={{
              fontSize: "clamp(2.6rem, 6vw, 4.8rem)",
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: "hsl(0 0% 95%)",
              animation: active ? "word-rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s both" : "none",
              opacity: active ? undefined : 0,
            }}
          >
            Context becomes<br />
            <span className="italic">
              <GradText>outreach.</GradText>
            </span>
          </h2>
          <p
            className="text-base md:text-lg leading-relaxed max-w-sm"
            style={{
              color: "hsl(0 0% 100% / 0.42)",
              animation: active ? "word-rise 0.5s cubic-bezier(0.22,1,0.36,1) 0.18s both" : "none",
              opacity: active ? undefined : 0,
            }}
          >
            Faster first drafts. Built from real lead context. Less blank-page work.
          </p>
        </div>

        {/* Right: email card — matches HowItWorks step 3 */}
        <div
          style={{
            animation: active ? "word-rise 0.5s cubic-bezier(0.22,1,0.36,1) 0.08s both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          <GlassCard active={active}>
            <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.12)" }}>
              <div>
                <div className="text-sm font-medium" style={{ color: "hsl(0 0% 100% / 0.8)" }}>Outreach draft</div>
                <div className="text-xs mt-0.5" style={{ color: "hsl(0 0% 100% / 0.3)" }}>Built from lead context</div>
              </div>
              <span
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: "hsl(261 75% 50% / 0.12)",
                  border: "1px solid hsl(261 75% 50% / 0.22)",
                  color: "hsl(261 75% 72%)",
                }}
              >
                Quality check passed
              </span>
            </div>
            <div className="px-5 py-5">
              <div className="text-xs mb-4" style={{ color: "hsl(0 0% 100% / 0.28)" }}>
                Subject: Quick idea for Northline's outbound push
              </div>
              <div className="space-y-3.5 text-sm md:text-base leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.68)" }}>
                {outreachLines.map((line, i) => (
                  <p
                    key={i}
                    style={{
                      opacity: visibleLines > i ? 1 : 0,
                      transform: visibleLines > i ? "translateY(0)" : "translateY(5px)",
                      transition: "opacity 0.25s ease, transform 0.25s ease",
                    }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

// ─── Chapter 4: Pipeline ──────────────────────────────────────────────────────
const PipelineChapter = ({ active }: { active: boolean }) => {
  const stages = [
    { label: "Contacted", desc: "Email sent" },
    { label: "Qualified", desc: "Reply received" },
    { label: "Proposal",  desc: "Meeting booked" },
    { label: "Closed",    desc: "Deal won" },
  ];
  const bars = [30, 54, 74, 92];

  return (
    <div className="flex h-full items-center">
      <div className="w-full max-w-4xl mx-auto px-6 md:px-16">
        <div className="text-center mb-12">
          <div className="flex justify-center">
            <SectionLabel num="04" label="Pipeline" visible={active} />
          </div>
          <h2
            className="font-display mb-4"
            style={{
              fontSize: "clamp(2.6rem, 6vw, 4.8rem)",
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: "hsl(0 0% 95%)",
              animation: active ? "word-rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s both" : "none",
              opacity: active ? undefined : 0,
            }}
          >
            From prospecting<br />
            <span className="italic"><GradText>to pipeline.</GradText></span>
          </h2>
          <p
            className="text-base md:text-lg leading-relaxed max-w-lg mx-auto"
            style={{
              color: "hsl(0 0% 100% / 0.42)",
              animation: active ? "word-rise 0.5s cubic-bezier(0.22,1,0.36,1) 0.18s both" : "none",
              opacity: active ? undefined : 0,
            }}
          >
            Every stage tracked in one place — from first email to closed deal.
          </p>
        </div>

        <div
          style={{
            animation: active ? "word-rise 0.4s cubic-bezier(0.22,1,0.36,1) 100ms both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          <GlassCard active={active} className="p-6">
            <div className="grid grid-cols-4 gap-4 h-36 items-end">
              {stages.map(({ label, desc }, i) => (
                <div key={label} className="flex flex-col items-center gap-2 h-full">
                  <div
                    className="w-full flex-1 rounded-xl overflow-hidden flex items-end"
                    style={{ background: "hsl(0 0% 100% / 0.04)" }}
                  >
                    <div
                      className="w-full rounded-xl"
                      style={{
                        height: active ? `${bars[i]}%` : "4%",
                        background: "linear-gradient(to top, hsl(261 75% 55% / 0.8), hsl(280 80% 65% / 0.4))",
                        transition: `height 0.6s cubic-bezier(0.22,1,0.36,1) ${i * 60}ms`,
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-medium" style={{ color: "hsl(0 0% 100% / 0.7)" }}>{label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: "hsl(0 0% 100% / 0.28)" }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

// ─── Chapter 5: What you get ─────────────────────────────────────────────────
const ResultsChapter = ({ active }: { active: boolean }) => {
  const items = [
    { heading: "Verified contacts", body: "Every email is SMTP-confirmed before it reaches you — no bounces, no guessing." },
    { heading: "Outreach written", body: "A personalized first-touch email is drafted for each prospect using their company context." },
    { heading: "Pipeline in one place", body: "Replies, follow-ups, and sequences stay organized without switching between tools." },
    { heading: "CRM stays in sync", body: "Connect Gmail, HubSpot, or Salesforce and leads sync automatically on every action." },
  ];

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-4xl mx-auto px-6">
        <div className="text-center mb-14">
          <SectionLabel num="05" label="What you get" visible={active} />
          <h2
            className="font-display text-center text-5xl"
            style={{
              fontSize: "clamp(2.4rem, 5vw, 4rem)",
              fontWeight: 800,
              lineHeight: 1.06,
              letterSpacing: "-0.02em",
              color: "hsl(0 0% 95%)",
              animation: active ? "word-rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.05s both" : "none",
              opacity: active ? undefined : 0,
            }}
          >
            Everything you need,<br />
            <span className="italic"><GradText>built into one workflow.</GradText></span>
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-5 max-w-3xl mx-auto">
          {items.map(({ heading, body }, i) => (
            <div
              key={i}
              className="rounded-xl p-6 text-left"
              style={{
                background: "hsl(0 0% 100% / 0.04)",
                border: "1px solid hsl(261 75% 50% / 0.18)",
                animation: active ? `counter-blur-in 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 80 + 80}ms both` : "none",
                opacity: active ? undefined : 0,
              }}
            >
              <div
                className="text-sm font-semibold mb-2"
                style={{ color: "hsl(261 75% 72%)" }}
              >
                {heading}
              </div>
              <div className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
                {body}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Chapter 6: CTA ───────────────────────────────────────────────────────────
const CTAChapter = ({ active }: { active: boolean }) => {
  const navigate = useNavigate();
  return (
    <div className="flex h-full items-center justify-center">
      {/* Purple glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, hsl(261 75% 50% / 0.14) 0%, hsl(280 70% 55% / 0.06) 40%, transparent 65%)",
          filter: "blur(60px)",
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 text-center max-w-2xl mx-auto px-6">
        <p
          className="text-[10px] uppercase tracking-[0.28em] mb-8 font-medium"
          style={{
            color: "hsl(261 75% 60%)",
            animation: active ? "word-rise 0.5s cubic-bezier(0.22,1,0.36,1) both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          Ready when you are
        </p>
        <h2
          className="font-display mb-6"
          style={{
            fontSize: "clamp(3rem, 8vw, 6.5rem)",
            fontWeight: 800,
            lineHeight: 1.04,
            letterSpacing: "-0.02em",
            color: "hsl(0 0% 96%)",
            animation: active ? "word-rise 0.6s cubic-bezier(0.22,1,0.36,1) 0.08s both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          <span className="block">Ready to run your</span>
          <span
            className="block italic"
            style={{
              background: "linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 80% 68%) 50%, hsl(261 75% 60%) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            first search?
          </span>
        </h2>
        <p
          className="text-lg font-light mb-12"
          style={{
            color: "hsl(0 0% 100% / 0.35)",
            animation: active ? "word-rise 0.5s cubic-bezier(0.22,1,0.36,1) 0.16s both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          Start free. No card needed. See your first leads in under 2 minutes.
        </p>
        <div
          style={{
            animation: active ? "word-rise 0.5s cubic-bezier(0.22,1,0.36,1) 0.24s both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          <button
            onClick={() => navigate("/auth")}
            className="cta-pill-glow inline-flex items-center gap-2 px-10 rounded-full text-sm font-semibold text-white group"
            style={{
              height: "56px",
              background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)",
            }}
          >
            Start for free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" />
          </button>
          <p className="mt-4 text-xs" style={{ color: "hsl(0 0% 100% / 0.2)" }}>
            No credit card required · Plans from $39/mo · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DemoPage() {
  useGlobalStyles();
  const navigate = useNavigate();
  const [heroVisible, setHeroVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ background: "hsl(261 75% 2%)" }} className="text-white">
      <SEOHead
        title="See SalesOS in Action | Product Demo"
        description="Watch how SalesOS takes you from ICP to ranked prospects with verified emails and AI-drafted outreach — in under 2 minutes."
      />
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section
        className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
        style={{ background: "hsl(261 75% 2%)" }}
      >
        {/* Dot grid — identical to landing */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
          aria-hidden="true"
        />

        {/* Orb left — matches landing */}
        <div
          className="absolute bottom-[-80px] left-[-120px] h-[360px] w-[360px] rounded-full pointer-events-none sm:h-[600px] sm:w-[600px] sm:bottom-[-120px] sm:left-[-80px]"
          style={{
            background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.18) 0%, hsl(261 75% 55% / 0.06) 50%, transparent 70%)",
            filter: "blur(40px)",
            animation: "hero-orb-demo 14s ease-in-out infinite",
          }}
          aria-hidden="true"
        />
        {/* Orb right */}
        <div
          className="absolute bottom-[-60px] right-[-110px] h-[320px] w-[320px] rounded-full pointer-events-none sm:h-[500px] sm:w-[500px] sm:bottom-[-100px] sm:right-[-100px]"
          style={{
            background: "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.14) 0%, hsl(280 70% 60% / 0.04) 50%, transparent 70%)",
            filter: "blur(50px)",
            animation: "hero-orb-demo 18s ease-in-out infinite reverse 3s",
          }}
          aria-hidden="true"
        />
        {/* Top glow */}
        <div
          className="absolute top-0 left-1/2 h-[240px] w-[500px] -translate-x-1/2 pointer-events-none sm:h-[400px] sm:w-[800px]"
          style={{
            background: "radial-gradient(ellipse at center top, hsl(261 75% 55% / 0.09) 0%, transparent 65%)",
          }}
          aria-hidden="true"
        />

        <div className="relative z-10 container mx-auto flex flex-col items-center px-6 text-center">
          {/* Label pill — matches landing */}
          <div
            className={`mb-8 transition-all duration-500 ${heroVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-3"}`}
          >
            <span className="inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-xs"
              style={{
                borderColor: "hsl(0 0% 100% / 0.1)",
                background: "hsl(0 0% 100% / 0.05)",
                color: "hsl(0 0% 100% / 0.6)",
                backdropFilter: "blur(8px)",
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ background: "hsl(261 75% 65%)" }} />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: "hsl(261 75% 55%)" }} />
              </span>
              <span className="font-medium" style={{ color: "hsl(0 0% 100% / 0.8)" }}>Interactive walkthrough</span>
            </span>
          </div>

          {/* Headline — Playfair Display, matches landing exactly */}
          <h1
            id="demo-heading"
            className={`font-display mb-6 transition-all duration-700 delay-75 ${heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
            style={{
              fontSize: "clamp(3rem, 14vw, 6.5rem)",
              fontWeight: 800,
              lineHeight: 0.96,
              letterSpacing: "-0.03em",
            }}
          >
            <span className="block text-white">From idea</span>
            <span
              className="block font-display italic animate-shiny"
              style={{
                backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "url(#c3-noise)",
              }}
            >
              to pipeline.
            </span>
          </h1>

          <p
            className={`mb-10 max-w-[22rem] text-base font-light leading-relaxed transition-all duration-700 delay-150 sm:max-w-xl sm:text-xl ${heroVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ color: "hsl(0 0% 100% / 0.45)" }}
          >
            Four steps. One session. Scroll to see how SalesOS takes you from a targeting idea to personalized outreach.
          </p>

          <div
            className={`flex flex-col items-center gap-2 transition-all duration-700 delay-200 ${heroVisible ? "opacity-100" : "opacity-0"}`}
            style={{ color: "hsl(0 0% 100% / 0.22)" }}
          >
            <span className="text-sm">Scroll to explore</span>
            <svg width="14" height="22" viewBox="0 0 14 22" fill="none" aria-hidden="true"
              style={{ animation: "chevron-bounce 1.8s ease-in-out infinite" }}>
              <path d="M7 1 L7 17 M3 13 L7 17 L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* Top hairline — matches landing section separator */}
      <div style={{ background: "hsl(261 75% 50% / 0.18)", height: "1px" }} />

      {/* ── Melt chapters ──────────────────────────────────────────────────── */}
      <MeltContainer chapters={[
        { render: (active) => <SearchChapter   active={active} />, glowPos: "18% 50%" },
        { render: (active) => <LeadsChapter    active={active} />, glowPos: "82% 50%" },
        { render: (active) => <OutreachChapter active={active} />, glowPos: "22% 50%" },
        { render: (active) => <PipelineChapter active={active} />, glowPos: "50% 28%" },
        { render: (active) => <ResultsChapter  active={active} />, glowPos: "50% 50%" },
        { render: (active) => <CTAChapter      active={active} />, glowPos: "50% 60%" },
      ]} />
    </div>
  );
}
