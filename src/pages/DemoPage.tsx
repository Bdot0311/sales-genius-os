import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/seo";

// ─── Global keyframes ─────────────────────────────────────────────────────────
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
    from { opacity: 0; transform: translateY(28px) scale(0.94); filter: blur(4px); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    filter: blur(0); }
  }
  @keyframes counter-blur-in {
    from { filter: blur(8px); opacity: 0; transform: scale(0.85); }
    to   { filter: blur(0);   opacity: 1; transform: scale(1); }
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes breathe {
    0%,100% { opacity: 0.5; transform: scale(1); }
    50%     { opacity: 1;   transform: scale(1.15); }
  }
  @keyframes glow-pulse {
    0%,100% { box-shadow: 0 0 40px hsl(261 75% 65% / 0.18), 0 0 80px hsl(261 75% 65% / 0.06); }
    50%     { box-shadow: 0 0 70px hsl(261 75% 65% / 0.32), 0 0 130px hsl(261 75% 65% / 0.12); }
  }
  @keyframes chevron-bounce {
    0%,100% { transform: translateY(0); }
    50%     { transform: translateY(6px); }
  }
  .animate-drift-1 { animation: drift 12s ease-in-out infinite; }
  .animate-drift-2 { animation: drift 16s ease-in-out infinite reverse; }
  .animate-drift-3 { animation: drift 20s ease-in-out infinite 3s; }
  .animate-breathe { animation: breathe 1.6s ease-in-out infinite; }
  .animate-spin-slow { animation: spin-slow 20s linear infinite; }
  .animate-spin-reverse { animation: spin-slow 30s linear infinite reverse; }
  .animate-glow-pulse { animation: glow-pulse 3s ease-in-out infinite; }
`;

const useGlobalStyles = () => {
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = GLOBAL_STYLES;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
};

// ─── Single scroll progress for a ref ────────────────────────────────────────
const useScrollProgress = (ref: { current: HTMLElement | null }) => {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const scrollable = ref.current.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      setProgress(Math.max(0, Math.min(1, -rect.top / scrollable)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [ref]);
  return progress;
};

// ─── Easing helpers ───────────────────────────────────────────────────────────
const easeOut3 = (t: number) => 1 - Math.pow(1 - t, 3);
const norm = (v: number, lo: number, hi: number) =>
  Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

// ─── MeltContainer ────────────────────────────────────────────────────────────
// All chapters are stacked in ONE sticky viewport. Scroll progress controls
// which chapter is visible. Chapters crossfade simultaneously — each fades out
// as the next fades in, creating a true melt effect (not sequential).
const MELT_FADE = 0.09; // fraction of total progress for each crossfade

const MeltContainer = ({
  chapters,
}: {
  chapters: Array<{
    render: (active: boolean) => React.ReactNode;
    glowPos: string;
  }>;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress(containerRef as { current: HTMLElement | null });
  const N = chapters.length;

  // Boundaries between chapters: evenly spaced
  const boundaries = Array.from({ length: N - 1 }, (_, i) => (i + 1) / N);

  const getFadeIn  = (i: number) =>
    i === 0 ? 1 : easeOut3(norm(progress, boundaries[i - 1] - MELT_FADE, boundaries[i - 1] + MELT_FADE));

  const getFadeOut = (i: number) =>
    i === N - 1 ? 0 : easeOut3(norm(progress, boundaries[i] - MELT_FADE, boundaries[i] + MELT_FADE));

  // Which chapter number is currently dominant (for the dot indicator)
  const activeIdx = boundaries.reduce((acc, b) => (progress >= b - MELT_FADE ? acc + 1 : acc), 0);

  return (
    <div ref={containerRef} style={{ height: `${N * 130}vh` }}>
      <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>

        {chapters.map(({ render, glowPos }, i) => {
          const fadeIn   = getFadeIn(i);
          const fadeOut  = getFadeOut(i);
          const opacity  = Math.max(0, Math.min(1, fadeIn - fadeOut));
          // Chapter slides up as it fades out, slides in from below as it fades in
          const translateY = (1 - fadeIn) * 26 - fadeOut * 20;
          const active   = opacity > 0.45;

          return (
            <div
              key={i}
              aria-hidden={!active}
              style={{
                position: "absolute",
                inset: 0,
                opacity,
                transform: `translateY(${translateY}px)`,
                willChange: "opacity, transform",
                pointerEvents: active ? "auto" : "none",
              }}
            >
              {/* Per-chapter ambient glow */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  opacity: Math.max(0, opacity * 0.9),
                  background: `radial-gradient(circle at ${glowPos}, hsl(261 75% 56% / 0.16), transparent 45%)`,
                }}
                aria-hidden="true"
              />
              {render(active)}
            </div>
          );
        })}

        {/* Chapter dot indicator — bottom center */}
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
                background: activeIdx === i ? "hsl(261 75% 65%)" : "hsl(0 0% 100% / 0.2)",
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

const Particles = ({ count = 22 }: { count?: number }) => {
  const pts = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.4 + 0.5,
      dur: Math.random() * 14 + 10,
      delay: Math.random() * 8,
      opacity: Math.random() * 0.35 + 0.08,
    }))
  ).current;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {pts.map((p) => (
        <div key={p.id} className="absolute rounded-full bg-primary"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size,
            opacity: p.opacity, animation: `drift ${p.dur}s ease-in-out infinite ${p.delay}s` }}
        />
      ))}
    </div>
  );
};

const SplitWords = ({
  text, visible, className = "", baseDelay = 0, gradient = false,
}: {
  text: string; visible: boolean; className?: string; baseDelay?: number; gradient?: boolean;
}) => (
  <span className={className} aria-label={text}>
    {text.split(" ").map((word, i) => (
      <span key={i} className="inline-block mr-[0.26em]"
        style={{
          animation: visible ? `word-rise 0.5s cubic-bezier(0.22,1,0.36,1) both` : "none",
          animationDelay: `${baseDelay + i * 34}ms`,
          opacity: visible ? undefined : 0,
        }}
      >
        {gradient ? (
          <span className="bg-gradient-to-r from-primary via-purple-400 to-primary/70 bg-clip-text text-transparent"
            style={{ filter: "drop-shadow(0 0 22px hsl(261 75% 65% / 0.45))" }}>
            {word}
          </span>
        ) : word}
      </span>
    ))}
  </span>
);

const GlassCard = ({
  children, className = "", active = false,
}: {
  children: React.ReactNode; className?: string; active?: boolean;
}) => (
  <div
    className={`relative rounded-[28px] border border-white/8 bg-black/45 backdrop-blur-2xl overflow-hidden ${className}`}
    style={{
      boxShadow: active
        ? "0 0 45px hsl(261 75% 55% / 0.12), 0 28px 90px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.06)"
        : "0 24px 70px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04)",
      backgroundImage: "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.01))",
      transition: "box-shadow 0.7s ease, transform 0.7s ease",
      transform: active ? "scale(1)" : "scale(0.988)",
    }}
  >
    {active && (
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: "linear-gradient(105deg, transparent 28%, rgba(255,255,255,0.045) 50%, transparent 72%)",
          animation: "shimmer-sweep 1.8s ease-in-out 0.22s 1 both",
        }}
        aria-hidden="true"
      />
    )}
    <div className="absolute top-0 left-0 right-0 h-px pointer-events-none"
      style={{ background: "linear-gradient(90deg, transparent, hsl(261 75% 65% / 0.45), transparent)" }}
      aria-hidden="true"
    />
    {children}
  </div>
);

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
        <span className="inline-block w-[2px] h-[0.9em] bg-primary align-middle ml-0.5 animate-breathe" />
      )}
    </>
  );
};

const ChapterLabel = ({ num, label, visible }: { num: string; label: string; visible: boolean }) => (
  <div className="flex items-center gap-3 mb-7"
    style={{
      animation: visible ? "word-rise 0.42s cubic-bezier(0.22,1,0.36,1) both" : "none",
      opacity: visible ? undefined : 0,
    }}
  >
    <span className="font-mono text-xs text-primary/55 tracking-[0.2em]">{num}</span>
    <div className="w-8 h-px bg-primary/25" />
    <span className="text-xs uppercase tracking-[0.18em] text-white/35 font-medium">{label}</span>
  </div>
);

// ─── Chapter 1: Search ────────────────────────────────────────────────────────
const SearchChapter = ({ active }: { active: boolean }) => (
  <div className="flex h-full items-center">
    <div className="w-full max-w-7xl mx-auto px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
      {/* Left: copy */}
      <div className="relative">
        <div className="absolute -top-10 -left-2 text-[7rem] md:text-[8.5rem] font-black text-white/[0.018] leading-none select-none pointer-events-none blur-[1px]" aria-hidden="true">01</div>
        <ChapterLabel num="01" label="Search" visible={active} />
        <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.05] mb-6">
          <div><SplitWords text="Describe who" visible={active} /></div>
          <div><SplitWords text="you want" visible={active} baseDelay={80} /></div>
          <div><SplitWords text="to reach." visible={active} baseDelay={150} gradient /></div>
        </h2>
        <p className="text-base md:text-lg text-white/42 leading-relaxed max-w-sm"
          style={{ animation: active ? "word-rise 0.38s cubic-bezier(0.22,1,0.36,1) 90ms both" : "none", opacity: active ? undefined : 0 }}>
          No Boolean filters. No field juggling. Just plain-English targeting that actually works.
        </p>
      </div>
      {/* Right: UI card */}
      <div style={{ animation: active ? "word-rise 0.42s cubic-bezier(0.22,1,0.36,1) 70ms both" : "none", opacity: active ? undefined : 0 }}>
        <GlassCard active={active}>
          {active && (
            <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent pointer-events-none z-20"
              style={{ animation: "scan-line 2.5s ease-in-out 0.6s 1 both" }}
              aria-hidden="true"
            />
          )}
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8">
            {["bg-red-500/35","bg-yellow-500/35","bg-green-500/35"].map((c, i) => (
              <div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`} />
            ))}
            <span className="ml-3 text-[11px] text-white/22 font-mono tracking-wider">ICP Builder</span>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-breathe" />
              <span className="text-[10px] text-primary/55">AI active</span>
            </div>
          </div>
          <div className="p-6 md:p-8 space-y-5">
            <div className="text-[10px] font-semibold text-primary/55 uppercase tracking-[0.2em]"
              style={{ opacity: active ? 1 : 0, transition: "opacity 0.4s 0.3s" }}>
              Describe your ideal customer
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-5 min-h-[88px]"
              style={{ boxShadow: active ? "inset 0 0 0 1px hsl(261 75% 65% / 0.18)" : "none", transition: "box-shadow 0.6s" }}>
              <div className="text-lg md:text-xl font-medium text-white/85 leading-relaxed">
                <Typewriter text="Heads of Sales at NYC B2B SaaS companies with 10–100 employees hiring SDRs" active={active} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Title", "Industry", "Company size", "Location", "Hiring signal"].map((tag, i) => (
                <span key={tag} className="px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-xs text-white/40 font-medium"
                  style={{
                    opacity: active ? 1 : 0,
                    transform: active ? "translateY(0) scale(1)" : "translateY(5px) scale(0.96)",
                    transition: `opacity 0.22s ${120 + i * 28}ms, transform 0.22s ${120 + i * 28}ms`,
                  }}>
                  {tag}
                </span>
              ))}
            </div>
            <div style={{ opacity: active ? 1 : 0, transform: active ? "translateY(0)" : "translateY(5px)", transition: "all 0.24s 220ms" }}>
              <div className="flex items-center justify-between text-xs text-white/28 mb-2">
                <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-breathe" /> Scanning database</span>
                <span className="text-primary font-semibold">847 matches</span>
              </div>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-primary via-purple-400 to-primary/55"
                  style={{ width: active ? "100%" : "0%", transition: "width 0.75s cubic-bezier(0.22,1,0.36,1) 380ms" }}
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
  { name: "Jordan Park",  meta: "Head of Sales · Northline",      fit: "High fit",  delay: 0   },
  { name: "Rina Shah",    meta: "VP Revenue · SignalFox",          fit: "Good fit",  delay: 130 },
  { name: "Alex Müller",  meta: "Director of Sales · GraphiteIQ", fit: "Good fit",  delay: 260 },
];

const LeadsChapter = ({ active }: { active: boolean }) => (
  <div className="flex h-full items-center">
    <div className="w-full max-w-7xl mx-auto px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
      {/* Left: lead cards */}
      <div className="space-y-4">
        {leadsData.map(({ name, meta, fit, delay }) => (
          <div key={name} style={{ animation: active ? `word-rise 0.38s cubic-bezier(0.22,1,0.36,1) ${Math.round(delay * 0.55)}ms both` : "none", opacity: active ? undefined : 0 }}>
            <GlassCard active={active} className="px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-xl font-semibold text-white/95">{name}</div>
                <div className="text-sm text-white/42 mt-0.5">{meta}</div>
              </div>
              <span className="rounded-full bg-primary/14 border border-primary/22 text-primary px-3 py-1 text-xs font-medium whitespace-nowrap">{fit}</span>
            </GlassCard>
          </div>
        ))}
      </div>
      {/* Right: copy */}
      <div className="relative">
        <div className="absolute -top-10 -right-2 text-[7rem] md:text-[8.5rem] font-black text-white/[0.018] leading-none select-none pointer-events-none text-right blur-[1px]" aria-hidden="true">02</div>
        <ChapterLabel num="02" label="Leads" visible={active} />
        <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.05] mb-6">
          <div><SplitWords text="The right accounts" visible={active} /></div>
          <div>
            <SplitWords text="surface" visible={active} baseDelay={100} />
            {" "}
            <SplitWords text="first." visible={active} baseDelay={140} gradient />
          </div>
        </h2>
        <p className="text-base md:text-lg text-white/42 leading-relaxed max-w-sm"
          style={{ animation: active ? "word-rise 0.36s cubic-bezier(0.22,1,0.36,1) 90ms both" : "none", opacity: active ? undefined : 0 }}>
          Not a massive list. A tighter one with context already built in — so you know who to email first.
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
    const t = setInterval(() => { i++; setVisibleLines(i); if (i >= outreachLines.length) clearInterval(t); }, 110);
    return () => clearInterval(t);
  }, [active]);

  return (
    <div className="flex h-full items-center">
      <div className="w-full max-w-7xl mx-auto px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center">
        {/* Left: copy */}
        <div className="relative">
          <div className="absolute -top-10 -left-2 text-[7rem] md:text-[8.5rem] font-black text-white/[0.018] leading-none select-none pointer-events-none blur-[1px]" aria-hidden="true">03</div>
          <ChapterLabel num="03" label="Outreach" visible={active} />
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.05] mb-6">
            <div><SplitWords text="Context becomes" visible={active} /></div>
            <div><SplitWords text="outreach." visible={active} baseDelay={110} gradient /></div>
          </h2>
          <p className="text-base md:text-lg text-white/42 leading-relaxed max-w-sm"
            style={{ animation: active ? "word-rise 0.42s cubic-bezier(0.22,1,0.36,1) 110ms both" : "none", opacity: active ? undefined : 0 }}>
            Faster first drafts. Built from real lead context. Less blank-page work.
          </p>
        </div>
        {/* Right: email card */}
        <div style={{ animation: active ? "word-rise 0.4s cubic-bezier(0.22,1,0.36,1) 60ms both" : "none", opacity: active ? undefined : 0 }}>
          <GlassCard active={active}>
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white/82">Outreach draft</div>
                <div className="text-xs text-white/32 mt-0.5">Built from lead context</div>
              </div>
              <span className="rounded-full bg-primary/12 border border-primary/20 text-primary/85 px-3 py-1 text-xs font-medium">Personalized</span>
            </div>
            <div className="px-5 py-5">
              <div className="text-xs text-white/28 mb-4">Subject: Quick idea for Northline's outbound hiring push</div>
              <div className="space-y-4 text-sm md:text-base leading-relaxed text-white/72">
                {outreachLines.map((line, i) => (
                  <p key={i} style={{
                    opacity: visibleLines > i ? 1 : 0,
                    transform: visibleLines > i ? "translateY(0)" : "translateY(5px)",
                    filter: visibleLines > i ? "blur(0)" : "blur(4px)",
                    transition: "opacity 0.22s ease, transform 0.22s ease, filter 0.22s ease",
                  }}>{line}</p>
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
  const bars   = [30, 54, 74, 92];
  const labels = ["Contacted", "Qualified", "Proposal", "Closed"];
  const metrics: [string, number, string, string][] = [
    ["Leads",    247,  "",  ""],
    ["Meetings",  34,  "",  ""],
    ["Revenue",   89,  "$", "K"],
    ["Conv.",     32,  "",  "%"],
  ];

  return (
    <div className="flex h-full items-center">
      <div className="w-full max-w-5xl mx-auto px-6 md:px-16">
        <div className="text-center mb-10 relative">
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-[7rem] md:text-[8.5rem] font-black text-white/[0.018] leading-none select-none pointer-events-none blur-[1px]" aria-hidden="true">04</div>
          <div className="flex justify-center">
            <ChapterLabel num="04" label="Pipeline" visible={active} />
          </div>
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.05] mb-4">
            <div><SplitWords text="From prospecting" visible={active} /></div>
            <div><SplitWords text="to pipeline." visible={active} baseDelay={120} gradient /></div>
          </h2>
          <p className="text-base md:text-lg text-white/42 leading-relaxed max-w-lg mx-auto"
            style={{ animation: active ? "word-rise 0.42s cubic-bezier(0.22,1,0.36,1) 120ms both" : "none", opacity: active ? undefined : 0 }}>
            Search, leads, outreach, pipeline — one workflow, one session.
          </p>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-5">
          {metrics.map(([label, to, prefix, suffix], i) => (
            <div key={label} style={{ animation: active ? `counter-blur-in 0.36s cubic-bezier(0.22,1,0.36,1) ${i * 38}ms both` : "none", opacity: active ? undefined : 0 }}>
              <GlassCard active={active} className="p-4 text-center">
                <div className="text-2xl md:text-3xl font-bold text-white/95">
                  <Counter to={to} prefix={prefix} suffix={suffix} active={active} />
                </div>
                <div className="text-xs text-white/32 mt-1">{label}</div>
              </GlassCard>
            </div>
          ))}
        </div>
        <div style={{ animation: active ? "word-rise 0.34s cubic-bezier(0.22,1,0.36,1) 80ms both" : "none", opacity: active ? undefined : 0 }}>
          <GlassCard active={active} className="p-5">
            <div className="grid grid-cols-4 gap-3 h-28 items-end">
              {bars.map((h, i) => (
                <div key={labels[i]} className="flex flex-col items-center gap-2 h-full">
                  <div className="w-full flex-1 rounded-xl bg-white/[0.04] overflow-hidden flex items-end">
                    <div className="w-full rounded-xl bg-gradient-to-t from-primary/70 to-primary/28"
                      style={{ height: active ? `${h}%` : "4%", transition: `height 0.42s cubic-bezier(0.22,1,0.36,1) ${i * 42}ms` }}
                    />
                  </div>
                  <span className="text-xs text-white/28">{labels[i]}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

// ─── Results (IntersectionObserver is fine here — not a scroll chapter) ───────
const ResultsBar = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.2 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const stats: [number, string, string, string][] = [
    [3,  "x",  "",   "faster from ICP to outreach"],
    [67, "%",  "",   "less time on list building"],
    [89, "K",  "$",  "in pipeline from one session"],
  ];
  return (
    <div ref={ref} className="grid grid-cols-3 gap-6 max-w-3xl mx-auto">
      {stats.map(([to, suffix, prefix, label], i) => (
        <div key={i} className="text-center"
          style={{ animation: visible ? `counter-blur-in 0.9s cubic-bezier(0.22,1,0.36,1) ${i * 150}ms both` : "none", opacity: visible ? undefined : 0 }}>
          <div className="text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-primary via-purple-400 to-primary/70 bg-clip-text text-transparent">
            <Counter to={to} prefix={prefix} suffix={suffix} active={visible} />
          </div>
          <div className="text-sm text-white/38 mt-2">{label}</div>
        </div>
      ))}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DemoPage() {
  useGlobalStyles();
  const navigate = useNavigate();

  return (
    <div className="bg-[#080810] text-white">
      <SEOHead
        title="See SalesOS in Action | Product Demo"
        description="Watch how SalesOS takes you from ICP to personalized outreach in minutes."
      />
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <Particles count={30} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-[620px] h-[620px] rounded-full border border-primary/7 animate-spin-slow" />
          <div className="absolute w-[440px] h-[440px] rounded-full border border-primary/5 animate-spin-reverse" />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,hsl(261_75%_50%/0.13),transparent_54%)]" aria-hidden="true" />
        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/22 bg-primary/8 text-xs font-medium text-primary/88 mb-8"
            style={{ animation: "word-rise 0.7s cubic-bezier(0.22,1,0.36,1) 0.1s both" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-breathe" />
            Product walkthrough
          </div>
          <h1 className="font-black tracking-tight leading-[0.93] mb-6"
            style={{ fontSize: "clamp(3.5rem, 10vw, 7rem)" }}>
            <div style={{ animation: "word-rise 0.9s cubic-bezier(0.22,1,0.36,1) 0.2s both" }}>
              From idea
            </div>
            <div className="bg-gradient-to-r from-primary via-purple-400 to-primary/80 bg-clip-text text-transparent"
              style={{
                animation: "word-rise 0.9s cubic-bezier(0.22,1,0.36,1) 0.42s both",
                filter: "drop-shadow(0 0 42px hsl(261 75% 65% / 0.38))",
              }}>
              to pipeline.
            </div>
          </h1>
          <p className="text-lg md:text-xl text-white/42 max-w-xl mx-auto leading-relaxed mb-12"
            style={{ animation: "word-rise 0.8s cubic-bezier(0.22,1,0.36,1) 0.68s both" }}>
            Four steps. One session. Scroll to watch how SalesOS takes you from a targeting idea to personalized outreach.
          </p>
          <div style={{ animation: "word-rise 0.7s cubic-bezier(0.22,1,0.36,1) 1s both" }}
            className="flex flex-col items-center gap-2 text-white/22 text-sm">
            <span>Scroll to explore</span>
            <svg width="14" height="22" viewBox="0 0 14 22" fill="none" aria-hidden="true"
              style={{ animation: "chevron-bounce 1.8s ease-in-out infinite" }}>
              <path d="M7 1 L7 17 M3 13 L7 17 L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── Melt chapters — all stack in one container, crossfade simultaneously ── */}
      <MeltContainer chapters={[
        { render: (active) => <SearchChapter   active={active} />, glowPos: "18% 50%" },
        { render: (active) => <LeadsChapter    active={active} />, glowPos: "82% 50%" },
        { render: (active) => <OutreachChapter active={active} />, glowPos: "22% 50%" },
        { render: (active) => <PipelineChapter active={active} />, glowPos: "50% 28%" },
      ]} />

      {/* ── Results ───────────────────────────────────────────────────────── */}
      <section className="relative py-28 md:py-36 overflow-hidden bg-[#080810]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(261_75%_50%/0.10),transparent_54%)]" aria-hidden="true" />
        <Particles count={14} />
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
          <div className="text-[10px] uppercase tracking-[0.28em] text-primary/55 mb-4">Results</div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-16 leading-tight">
            What changes when<br />
            <span className="bg-gradient-to-r from-primary via-purple-400 to-primary/70 bg-clip-text text-transparent">
              prospecting gets easier.
            </span>
          </h2>
          <ResultsBar />
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="relative py-28 md:py-36 overflow-hidden bg-[#050508]">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-[520px] h-[520px] rounded-full border border-primary/6 animate-spin-slow" />
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(261_75%_50%/0.16),transparent_50%)]" aria-hidden="true" />
        <div className="relative z-10 text-center max-w-2xl mx-auto px-6">
          <h2 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-5 leading-tight">
            Ready to run your<br />
            <span className="bg-gradient-to-r from-primary via-purple-400 to-primary/70 bg-clip-text text-transparent">
              first search?
            </span>
          </h2>
          <p className="text-lg text-white/38 mb-10">
            Start free. No card needed. 10 ICP-scored leads on us.
          </p>
          <Button variant="hero" size="lg" className="group text-base" onClick={() => navigate("/auth")}>
            Get 10 free leads
            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-0.5 transition-transform" />
          </Button>
          <div className="mt-4">
            <button className="text-sm text-white/25 hover:text-white/50 transition-colors" onClick={() => navigate("/pricing")}>
              View plans →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
