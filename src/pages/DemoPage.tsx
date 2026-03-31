import { useEffect, useRef, useState, useCallback } from "react";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/seo";

// ─── Global keyframe styles ───────────────────────────────────────────────────
const GLOBAL_STYLES = `
  @keyframes float-up {
    0%   { transform: translateY(0px)   opacity: 1; }
    100% { transform: translateY(-120px); opacity: 0; }
  }
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
    0%   { top: 0%;    opacity: 0.8; }
    90%  { top: 100%;  opacity: 0.8; }
    100% { top: 100%;  opacity: 0; }
  }
  @keyframes draw-line {
    from { width: 0; }
    to   { width: 100%; }
  }
  @keyframes breathe {
    0%,100% { transform: scale(1);    opacity: 0.6; }
    50%     { transform: scale(1.12); opacity: 1; }
  }
  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes counter-blur-in {
    from { filter: blur(8px); opacity: 0; transform: scale(0.85); }
    to   { filter: blur(0);   opacity: 1; transform: scale(1); }
  }
  @keyframes word-rise {
    from { opacity: 0; transform: translateY(28px) scale(0.94); filter: blur(4px); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    filter: blur(0); }
  }
  @keyframes chapter-num-in {
    from { opacity: 0; transform: scale(2.4) translateY(16px); filter: blur(12px); }
    to   { opacity: 1; transform: scale(1)   translateY(0);    filter: blur(0); }
  }
  @keyframes slide-from-right {
    from { opacity: 0; transform: translateX(40px) scale(0.96); filter: blur(4px); }
    to   { opacity: 1; transform: translateX(0)    scale(1);    filter: blur(0); }
  }
  @keyframes slide-from-left {
    from { opacity: 0; transform: translateX(-40px) scale(0.96); filter: blur(4px); }
    to   { opacity: 1; transform: translateX(0)     scale(1);    filter: blur(0); }
  }
  @keyframes emerge {
    from { opacity: 0; transform: translateY(32px) scale(0.9); filter: blur(6px); }
    to   { opacity: 1; transform: translateY(0)    scale(1);   filter: blur(0); }
  }
  @keyframes glow-pulse {
    0%,100% { box-shadow: 0 0 40px hsl(261 75% 65% / 0.2), 0 0 80px hsl(261 75% 65% / 0.08); }
    50%     { box-shadow: 0 0 60px hsl(261 75% 65% / 0.35), 0 0 120px hsl(261 75% 65% / 0.15); }
  }
  @keyframes border-rotate {
    from { --angle: 0deg; }
    to   { --angle: 360deg; }
  }
  .animate-drift-1 { animation: drift 12s ease-in-out infinite; }
  .animate-drift-2 { animation: drift 16s ease-in-out infinite reverse; }
  .animate-drift-3 { animation: drift 20s ease-in-out infinite 3s; }
  .animate-breathe { animation: breathe 4s ease-in-out infinite; }
  .animate-spin-slow { animation: spin-slow 20s linear infinite; }
  .animate-glow-pulse { animation: glow-pulse 3s ease-in-out infinite; }
`;

// ─── Style injector ───────────────────────────────────────────────────────────
const useGlobalStyles = () => {
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = GLOBAL_STYLES;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
};

// ─── Scroll-reveal hook ───────────────────────────────────────────────────────
const useReveal = (threshold = 0.2) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
};

// ─── Number counter ───────────────────────────────────────────────────────────
const Counter = ({ to, suffix = "", active }: { to: number; suffix?: string; active: boolean }) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) { setVal(0); return; }
    const dur = 1600;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(ease * to));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active, to]);
  return <>{val}{suffix}</>;
};

// ─── Floating ambient particles ───────────────────────────────────────────────
const Particles = ({ count = 20 }: { count?: number }) => {
  const particles = useRef(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.5,
      dur: Math.random() * 14 + 10,
      delay: Math.random() * 8,
      opacity: Math.random() * 0.4 + 0.1,
    }))
  ).current;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-primary"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            opacity: p.opacity,
            animation: `drift ${p.dur}s ease-in-out infinite ${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

// ─── Word-by-word headline ────────────────────────────────────────────────────
const SplitWords = ({
  text,
  visible,
  className = "",
  baseDelay = 0,
  gradient = false,
}: {
  text: string;
  visible: boolean;
  className?: string;
  baseDelay?: number;
  gradient?: boolean;
}) => (
  <span className={className} aria-label={text}>
    {text.split(" ").map((word, i) => (
      <span
        key={i}
        className="inline-block mr-[0.28em]"
        style={{
          animation: visible ? `word-rise 0.7s cubic-bezier(0.22,1,0.36,1) both` : "none",
          animationDelay: `${baseDelay + i * 80}ms`,
          opacity: visible ? undefined : 0,
        }}
      >
        {gradient ? (
          <span className="bg-gradient-to-r from-primary via-purple-400 to-primary/70 bg-clip-text text-transparent"
            style={{ filter: "drop-shadow(0 0 24px hsl(261 75% 65% / 0.5))" }}>
            {word}
          </span>
        ) : word}
      </span>
    ))}
  </span>
);

// ─── Shimmer card ─────────────────────────────────────────────────────────────
const GlassCard = ({
  children,
  className = "",
  active = false,
  glowColor = "hsl(261 75% 55% / 0.15)",
}: {
  children: React.ReactNode;
  className?: string;
  active?: boolean;
  glowColor?: string;
}) => (
  <div
    className={`relative rounded-2xl border border-white/8 bg-black/50 backdrop-blur-xl overflow-hidden ${className}`}
    style={{
      boxShadow: active
        ? `0 0 60px ${glowColor}, 0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`
        : `0 24px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)`,
      transition: "box-shadow 1s ease",
    }}
  >
    {/* Shimmer sweep */}
    {active && (
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)",
          animation: "shimmer-sweep 2.4s ease-in-out 0.3s 1 both",
        }}
        aria-hidden="true"
      />
    )}
    {/* Top edge glow */}
    <div
      className="absolute top-0 left-0 right-0 h-px pointer-events-none"
      style={{ background: "linear-gradient(90deg, transparent, hsl(261 75% 65% / 0.4), transparent)" }}
      aria-hidden="true"
    />
    {children}
  </div>
);

// ─── Chapter number decoration ────────────────────────────────────────────────
const ChapterNumber = ({ num, visible }: { num: string; visible: boolean }) => (
  <div
    className="text-[9rem] sm:text-[13rem] font-black text-white/[0.035] leading-none select-none pointer-events-none absolute -top-8 -left-4"
    style={{
      animation: visible ? "chapter-num-in 1s cubic-bezier(0.22,1,0.36,1) both" : "none",
      opacity: visible ? undefined : 0,
    }}
    aria-hidden="true"
  >
    {num}
  </div>
);

// ─── Typewriter ───────────────────────────────────────────────────────────────
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
    }, 400);
    return () => clearTimeout(delay);
  }, [active, text, speed]);

  return (
    <>
      {typed}
      {active && typed.length < text.length && (
        <span
          className="inline-block w-[2px] h-[0.9em] bg-primary align-middle ml-0.5"
          style={{ animation: "breathe 0.8s ease-in-out infinite" }}
        />
      )}
    </>
  );
};

// ─── Scene 1: ICP Search ──────────────────────────────────────────────────────
const SearchScene = ({ active }: { active: boolean }) => {
  const done = active;
  return (
    <GlassCard active={active}>
      {/* Scan line */}
      {active && (
        <div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent pointer-events-none z-20"
          style={{ animation: "scan-line 2s ease-in-out 0.5s 1 both" }}
          aria-hidden="true"
        />
      )}
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8">
        {["bg-red-500/40","bg-yellow-500/40","bg-green-500/40"].map((c, i) => (
          <div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`} />
        ))}
        <span className="ml-3 text-[11px] text-white/25 font-mono tracking-wider">ICP Builder</span>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[10px] text-primary/60">AI active</span>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        {/* Label */}
        <div
          className="text-[10px] font-semibold text-primary/60 uppercase tracking-[0.2em]"
          style={{ opacity: active ? 1 : 0, transition: "opacity 0.4s 0.2s" }}
        >
          Describe your ideal customer
        </div>

        {/* Input */}
        <div
          className="rounded-xl border border-white/8 bg-white/[0.03] p-5 min-h-[90px]"
          style={{
            boxShadow: active ? "inset 0 0 0 1px hsl(261 75% 65% / 0.2)" : "none",
            transition: "box-shadow 0.6s",
          }}
        >
          <div className="text-lg md:text-xl font-medium text-white/85 leading-relaxed">
            <Typewriter
              text="Heads of Sales at NYC B2B SaaS companies with 10–100 employees hiring SDRs"
              active={active}
            />
          </div>
        </div>

        {/* Signal tags */}
        <div className="flex flex-wrap gap-2">
          {["Title", "Industry", "Company size", "Location", "Hiring signal"].map((tag, i) => (
            <span
              key={tag}
              className="px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] text-xs text-white/45 font-medium"
              style={{
                opacity: active ? 1 : 0,
                transform: active ? "translateY(0) scale(1)" : "translateY(8px) scale(0.9)",
                transition: `opacity 0.4s ${1800 + i * 100}ms, transform 0.4s ${1800 + i * 100}ms`,
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Matching progress */}
        <div
          style={{ opacity: done ? 1 : 0, transform: done ? "translateY(0)" : "translateY(8px)", transition: "all 0.5s 2400ms" }}
        >
          <div className="flex items-center justify-between text-xs text-white/30 mb-2">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Scanning database
            </span>
            <span className="text-primary font-semibold">847 matches</span>
          </div>
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-purple-400 to-primary/60"
              style={{
                width: done ? "100%" : "0%",
                transition: "width 1.8s cubic-bezier(0.4,0,0.2,1) 2600ms",
              }}
            />
          </div>
        </div>
      </div>
    </GlassCard>
  );
};

// ─── Scene 2: Ranked Leads ────────────────────────────────────────────────────
const leads = [
  { name: "Jordan Park",  role: "Head of Sales · Northline",    score: 97, delay: 0 },
  { name: "Rina Shah",    role: "VP Revenue · SignalFox",        score: 91, delay: 160 },
  { name: "Alex Müller",  role: "Director of Sales · GraphiteIQ", score: 88, delay: 320 },
];

const LeadsScene = ({ active }: { active: boolean }) => (
  <GlassCard active={active} className="overflow-visible">
    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8">
      {["bg-red-500/40","bg-yellow-500/40","bg-green-500/40"].map((c, i) => (
        <div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`} />
      ))}
      <span className="ml-3 text-[11px] text-white/25 font-mono tracking-wider">Lead Results</span>
      <span className="ml-auto text-[10px] text-primary/60 font-mono">
        <Counter to={847} active={active} /> results
      </span>
    </div>

    <div className="p-5 space-y-3">
      {/* Column headers */}
      <div
        className="grid grid-cols-[1fr_auto] gap-4 px-2 text-[10px] font-semibold text-white/20 uppercase tracking-widest"
        style={{ opacity: active ? 1 : 0, transition: "opacity 0.4s 0.1s" }}
      >
        <span>Prospect</span>
        <span>ICP Score</span>
      </div>

      {leads.map((l) => (
        <div
          key={l.name}
          className="group flex items-center gap-4 rounded-xl border border-white/6 bg-white/[0.03] px-4 py-3.5 hover:bg-white/[0.06] hover:border-primary/20 transition-all duration-300 cursor-pointer"
          style={{
            opacity: active ? 1 : 0,
            transform: active ? "translateX(0) scale(1)" : "translateX(20px) scale(0.96)",
            transition: `opacity 0.5s cubic-bezier(0.22,1,0.36,1) ${l.delay}ms, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${l.delay}ms`,
          }}
        >
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-purple-600/20 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
            {l.name.split(" ").map(w => w[0]).join("")}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{l.name}</p>
            <p className="text-xs text-white/35 truncate">{l.role}</p>
          </div>

          {/* Score with animated bar */}
          <div className="flex-shrink-0 flex items-center gap-3">
            <div className="hidden sm:block w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-purple-400"
                style={{
                  width: active ? `${l.score}%` : "0%",
                  transition: `width 1.2s cubic-bezier(0.4,0,0.2,1) ${l.delay + 400}ms`,
                }}
              />
            </div>
            <span
              className="text-base font-black text-primary w-8 text-right tabular-nums"
              style={{
                animation: active ? `counter-blur-in 0.6s cubic-bezier(0.22,1,0.36,1) ${l.delay + 300}ms both` : "none",
              }}
            >
              {l.score}
            </span>
          </div>
        </div>
      ))}

      <div
        className="px-4 py-2.5 rounded-xl border border-dashed border-white/5"
        style={{ opacity: active ? 1 : 0, transition: "opacity 0.5s 900ms" }}
      >
        <p className="text-[11px] text-white/20 text-center">+ <Counter to={844} active={active} /> more ranked matches</p>
      </div>
    </div>
  </GlassCard>
);

// ─── Scene 3: Outreach ────────────────────────────────────────────────────────
const emailLines = [
  "Hey Jordan — noticed Northline is hiring SDRs and growing the sales team in NYC.",
  "That usually means more pressure to build a repeatable prospecting workflow fast.",
  "SalesOS helps teams go from ICP to qualified outreach in under an hour.",
  "Worth a quick look?",
];

const OutreachScene = ({ active }: { active: boolean }) => {
  const [shown, setShown] = useState(0);
  const [scored, setScored] = useState(false);

  useEffect(() => {
    if (!active) { setShown(0); setScored(false); return; }
    let i = 0;
    const t = setInterval(() => {
      i++;
      setShown(i);
      if (i >= emailLines.length) {
        clearInterval(t);
        setTimeout(() => setScored(true), 500);
      }
    }, 700);
    return () => clearInterval(t);
  }, [active]);

  return (
    <GlassCard active={active}>
      {/* Scan line */}
      {active && (
        <div
          className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent pointer-events-none z-20"
          style={{ animation: "scan-line 1.8s ease-in-out 0.4s 1 both" }}
          aria-hidden="true"
        />
      )}

      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8">
        <div className="flex items-center gap-2.5">
          {["bg-red-500/40","bg-yellow-500/40","bg-green-500/40"].map((c, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`} />
          ))}
          <span className="ml-1 text-[11px] text-white/25 font-mono">Outreach draft · Jordan Park</span>
        </div>
        {/* Quality score badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/20 bg-primary/10"
          style={{
            opacity: scored ? 1 : 0,
            transform: scored ? "scale(1)" : "scale(0.8)",
            transition: "all 0.5s cubic-bezier(0.34,1.56,0.64,1)",
          }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] font-semibold text-primary">Quality: 94/100</span>
        </div>
      </div>

      <div className="p-6 md:p-8">
        <p className="text-[11px] text-white/20 mb-6 font-mono">
          Subject: Quick idea for Northline's outbound hiring push
        </p>
        <div className="space-y-4">
          {emailLines.map((line, i) => (
            <p
              key={i}
              className="text-base md:text-lg text-white/70 leading-relaxed"
              style={{
                opacity: shown > i ? 1 : 0,
                transform: shown > i ? "translateY(0)" : "translateY(12px)",
                filter: shown > i ? "blur(0)" : "blur(4px)",
                transition: "all 0.5s cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              {line}
            </p>
          ))}
        </div>

        {/* Action buttons */}
        <div
          className="flex items-center gap-3 mt-8"
          style={{
            opacity: shown >= emailLines.length ? 1 : 0,
            transform: shown >= emailLines.length ? "translateY(0)" : "translateY(10px)",
            transition: "all 0.5s cubic-bezier(0.22,1,0.36,1) 200ms",
          }}
        >
          <button className="px-5 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-all hover:shadow-[0_0_20px_hsl(261_75%_65%/0.4)] hover:-translate-y-0.5">
            Send
          </button>
          <button className="px-4 py-2 rounded-lg border border-white/10 text-white/40 text-xs hover:text-white/70 transition-colors">
            Edit draft
          </button>
          <span className="ml-auto text-[10px] text-white/20">5/5 quality checks passed</span>
        </div>
      </div>
    </GlassCard>
  );
};

// ─── Scene 4: Pipeline ────────────────────────────────────────────────────────
const stages = [
  { label: "Contacted", count: 247, pct: 100, delay: 0 },
  { label: "Opened",    count: 158, pct: 64,  delay: 150 },
  { label: "Replied",   count: 28,  pct: 28,  delay: 300 },
  { label: "Meeting",   count: 11,  pct: 11,  delay: 450 },
];

const PipelineScene = ({ active }: { active: boolean }) => (
  <GlassCard active={active}>
    <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/8">
      {["bg-red-500/40","bg-yellow-500/40","bg-green-500/40"].map((c, i) => (
        <div key={i} className={`w-2.5 h-2.5 rounded-full ${c}`} />
      ))}
      <span className="ml-3 text-[11px] text-white/25 font-mono">Pipeline · Q1 2026</span>
      <div className="ml-auto flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[10px] text-green-400/70">Live</span>
      </div>
    </div>

    <div className="p-6 md:p-8 space-y-5">
      {stages.map((s) => (
        <div key={s.label}>
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs text-white/45 font-medium"
              style={{ opacity: active ? 1 : 0, transition: `opacity 0.4s ${s.delay}ms` }}
            >
              {s.label}
            </span>
            <span
              className="text-sm font-bold text-white tabular-nums"
              style={{
                animation: active ? `counter-blur-in 0.5s cubic-bezier(0.22,1,0.36,1) ${s.delay + 200}ms both` : "none",
              }}
            >
              <Counter to={s.count} active={active} />
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: active ? `${s.pct}%` : "0%",
                background: `linear-gradient(90deg, hsl(261 75% 55%) 0%, hsl(280 75% 60%) 100%)`,
                opacity: 0.6 + s.pct / 250,
                transition: `width 1.4s cubic-bezier(0.4,0,0.2,1) ${s.delay}ms`,
                boxShadow: active ? "0 0 8px hsl(261 75% 65% / 0.4)" : "none",
              }}
            />
          </div>
        </div>
      ))}

      {/* Key metrics */}
      <div
        className="grid grid-cols-3 gap-3 pt-5 border-t border-white/5"
        style={{
          opacity: active ? 1 : 0,
          transform: active ? "translateY(0)" : "translateY(12px)",
          transition: "all 0.6s cubic-bezier(0.22,1,0.36,1) 800ms",
        }}
      >
        {[
          { val: 11, suf: ".4%", label: "Reply rate" },
          { val: 1, suf: " hr", label: "Time to launch" },
          { val: 3, suf: ".1×",  label: "Faster pipeline" },
        ].map((m) => (
          <div key={m.label} className="text-center">
            <p className="text-xl font-black bg-gradient-to-r from-primary to-purple-300 bg-clip-text text-transparent">
              <Counter to={m.val} active={active} suffix={m.suf} />
            </p>
            <p className="text-[10px] text-white/25 mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  </GlassCard>
);

// ─── Chapter config ───────────────────────────────────────────────────────────
const chapters = [
  { num: "01", kicker: "Find", headline: "Describe who\nyou want.", sub: "No boolean search. No filters. Plain English — SalesOS handles the rest.", Scene: SearchScene, flip: false },
  { num: "02", kicker: "Prioritize", headline: "Best fits\nsurface first.", sub: "Every prospect scored 0–100 against your ICP. Spend time where it counts.", Scene: LeadsScene, flip: true },
  { num: "03", kicker: "Reach out", headline: "Context becomes\noutreach.", sub: "AI writes each email from their profile. Five quality checks run before you send.", Scene: OutreachScene, flip: false },
  { num: "04", kicker: "Close", headline: "One place\nfor everything.", sub: "Pipeline, replies, follow-ups. One system keeps it moving without juggling tools.", Scene: PipelineScene, flip: true },
];

// ─── Chapter section ──────────────────────────────────────────────────────────
const ChapterSection = ({ chapter, index }: { chapter: typeof chapters[0]; index: number }) => {
  const { ref, visible } = useReveal(0.15);

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex items-center py-28 md:py-36 overflow-hidden"
    >
      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none animate-breathe"
        style={{
          [chapter.flip ? "right" : "left"]: "-15%",
          top: "15%",
          width: "55vw",
          height: "55vw",
          maxWidth: 800,
          maxHeight: 800,
          background: "radial-gradient(circle, hsl(261 75% 55% / 0.07) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />
      {/* Subtle grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.015]"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)", backgroundSize: "80px 80px" }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-6 relative z-10">
        <div className={`grid lg:grid-cols-2 gap-16 lg:gap-24 items-center max-w-[1160px] mx-auto`}>

          {/* Copy col */}
          <div className={`relative ${chapter.flip ? "lg:order-2" : ""}`}>
            <ChapterNumber num={chapter.num} visible={visible} />

            <div
              className="mb-4 flex items-center gap-3"
              style={{
                opacity: visible ? 1 : 0,
                animation: visible ? "slide-from-left 0.7s cubic-bezier(0.22,1,0.36,1) 0.1s both" : "none",
              }}
            >
              <span className="text-[10px] font-mono text-primary/40 tracking-[0.25em]">{chapter.num}</span>
              <div
                className="h-px bg-gradient-to-r from-primary/50 to-transparent"
                style={{ width: visible ? 48 : 0, transition: "width 0.6s 0.3s" }}
              />
              <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">{chapter.kicker}</span>
            </div>

            <h2
              className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.0] mb-6 whitespace-pre-line"
              style={{ opacity: visible ? undefined : 0 }}
            >
              <SplitWords text={chapter.headline.replace("\n", " ")} visible={visible} baseDelay={200} />
            </h2>

            <p
              className="text-lg text-white/45 leading-relaxed max-w-md"
              style={{
                opacity: visible ? 1 : 0,
                animation: visible ? "slide-from-left 0.7s cubic-bezier(0.22,1,0.36,1) 0.55s both" : "none",
              }}
            >
              {chapter.sub}
            </p>
          </div>

          {/* Scene col */}
          <div
            className={chapter.flip ? "lg:order-1" : ""}
            style={{
              opacity: visible ? 1 : 0,
              animation: visible
                ? `${chapter.flip ? "slide-from-left" : "slide-from-right"} 0.8s cubic-bezier(0.22,1,0.36,1) 0.25s both`
                : "none",
            }}
          >
            <chapter.Scene active={visible} />
          </div>
        </div>
      </div>

      {/* Chapter divider */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />
    </section>
  );
};

// ─── Results bar ──────────────────────────────────────────────────────────────
const ResultsBar = () => {
  const { ref, visible } = useReveal(0.2);
  return (
    <section ref={ref} className="relative py-28 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 50%, hsl(261 75% 55% / 0.07) 0%, transparent 60%)" }}
        aria-hidden="true"
      />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />
      <div className="container mx-auto px-6">
        <div
          className="text-center mb-16"
          style={{
            opacity: visible ? 1 : 0,
            animation: visible ? "emerge 0.8s cubic-bezier(0.22,1,0.36,1) both" : "none",
          }}
        >
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.25em] mb-3">Early access cohort</p>
          <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight">
            <SplitWords text="Real results." visible={visible} baseDelay={200} />
            {" "}
            <SplitWords text="Real teams." visible={visible} baseDelay={400} gradient />
          </h2>
        </div>

        <div
          className="grid sm:grid-cols-3 max-w-3xl mx-auto rounded-2xl overflow-hidden border border-white/6"
          style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))" }}
        >
          {[
            { stat: "11.4%", label: "Avg. reply rate",       sub: "up from 2.8% pre-switch",    delay: 0 },
            { stat: "< 1 hr", label: "To first sequence",     sub: "from signup to sending",      delay: 120 },
            { stat: "6.1%→1.3%", label: "Bounce rate drop",  sub: "in the first two weeks",     delay: 240 },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`flex flex-col items-center gap-2 text-center px-8 py-10 hover:bg-white/[0.025] transition-colors duration-300 ${i < 2 ? "sm:border-r border-white/6" : ""}`}
              style={{
                opacity: visible ? 1 : 0,
                animation: visible ? `emerge 0.7s cubic-bezier(0.22,1,0.36,1) ${s.delay + 300}ms both` : "none",
              }}
            >
              <span className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-primary via-purple-300 to-primary/70 bg-clip-text text-transparent tabular-nums">
                {s.stat}
              </span>
              <span className="text-sm font-semibold text-white/60">{s.label}</span>
              <span className="text-xs text-white/25">{s.sub}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/6 to-transparent" />
    </section>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const DemoPage = () => {
  const navigate = useNavigate();
  const { ref: heroRef, visible: heroVisible } = useReveal(0.05);
  const { ref: ctaRef, visible: ctaVisible } = useReveal(0.15);
  useGlobalStyles();

  return (
    <>
      <SEOHead
        title="SalesOS — See How It Works"
        description="Watch SalesOS turn plain-English ICP descriptions into ranked leads, personalized outreach, and pipeline in one workflow."
      />

      <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
        <Navbar />

        {/* ── HERO ──────────────────────────────────────────────────────── */}
        <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-6 overflow-hidden">
          <Particles count={30} />
          <div className="absolute inset-0 grid-bg opacity-[0.08] pointer-events-none" aria-hidden="true" />

          {/* Big rotating ring */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full border border-white/[0.03] pointer-events-none animate-spin-slow"
            aria-hidden="true"
          />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-primary/[0.06] pointer-events-none"
            style={{ animation: "spin-slow 14s linear infinite reverse" }}
            aria-hidden="true"
          />
          {/* Core glow */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] pointer-events-none animate-breathe"
            style={{ background: "radial-gradient(ellipse, hsl(261 75% 55% / 0.14) 0%, transparent 65%)" }}
            aria-hidden="true"
          />
          <div className="noise-texture" aria-hidden="true" />

          <div ref={heroRef} className="relative z-10 max-w-5xl mx-auto">
            {/* Eyebrow */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-10"
              style={{
                opacity: heroVisible ? 1 : 0,
                animation: heroVisible ? "emerge 0.7s cubic-bezier(0.22,1,0.36,1) both" : "none",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Interactive walkthrough · 4 chapters
            </div>

            {/* Big headline */}
            <h1 className="text-6xl sm:text-7xl lg:text-[6rem] xl:text-[7rem] font-black tracking-tight leading-[0.96] mb-4">
              <span className="block text-white">
                <SplitWords text="From idea" visible={heroVisible} baseDelay={100} />
              </span>
              <span className="block">
                <SplitWords text="to pipeline." visible={heroVisible} baseDelay={350} gradient />
              </span>
            </h1>

            {/* Sub */}
            <p
              className="text-xl sm:text-2xl text-white/40 max-w-xl mx-auto leading-relaxed mt-6 mb-12"
              style={{
                opacity: heroVisible ? 1 : 0,
                animation: heroVisible ? "emerge 0.8s cubic-bezier(0.22,1,0.36,1) 0.6s both" : "none",
              }}
            >
              Four chapters. One workflow. No spreadsheets.
            </p>

            {/* CTAs */}
            <div
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
              style={{
                opacity: heroVisible ? 1 : 0,
                animation: heroVisible ? "emerge 0.8s cubic-bezier(0.22,1,0.36,1) 0.75s both" : "none",
              }}
            >
              <div className="animated-border inline-block rounded-xl">
                <Button
                  size="lg"
                  className="h-14 px-8 text-base font-semibold bg-primary text-white hover:bg-primary/90 rounded-[calc(0.75rem-1px)] group shadow-[0_0_40px_hsl(261_75%_65%/0.3)] hover:shadow-[0_0_60px_hsl(261_75%_65%/0.5)] hover:-translate-y-0.5 transition-all duration-200"
                  onClick={() => navigate("/auth")}
                >
                  Get 10 free ICP-scored leads
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
              <button
                className="text-white/30 hover:text-white/60 text-sm transition-colors flex items-center gap-2 group"
                onClick={() => document.getElementById("ch-01")?.scrollIntoView({ behavior: "smooth" })}
              >
                Scroll through the demo
                <ChevronDown className="w-4 h-4 group-hover:translate-y-0.5 transition-transform animate-bounce" />
              </button>
            </div>
          </div>

          {/* Scroll line */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none" aria-hidden="true">
            <div className="w-px h-14 bg-gradient-to-b from-white/20 to-transparent" />
          </div>
        </section>

        {/* ── CHAPTERS ──────────────────────────────────────────────────── */}
        <div id="ch-01">
          {chapters.map((chapter, i) => (
            <ChapterSection key={chapter.num} chapter={chapter} index={i} />
          ))}
        </div>

        {/* ── RESULTS BAR ───────────────────────────────────────────────── */}
        <ResultsBar />

        {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
        <section
          ref={ctaRef}
          className="relative py-40 md:py-52 flex items-center justify-center text-center px-6 overflow-hidden"
        >
          <Particles count={15} />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[700px] pointer-events-none animate-breathe"
            style={{ background: "radial-gradient(ellipse, hsl(261 75% 55% / 0.13) 0%, transparent 60%)" }}
            aria-hidden="true"
          />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-white/[0.025] pointer-events-none"
            style={{ animation: "spin-slow 25s linear infinite" }}
            aria-hidden="true"
          />
          <div className="noise-texture" aria-hidden="true" />

          <div
            className="relative z-10 max-w-3xl mx-auto"
            style={{
              opacity: ctaVisible ? 1 : 0,
              animation: ctaVisible ? "emerge 0.9s cubic-bezier(0.22,1,0.36,1) both" : "none",
            }}
          >
            <h2 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight leading-[0.97] text-white mb-4">
              <SplitWords text="Ready to run" visible={ctaVisible} baseDelay={100} />
              <br />
              <SplitWords text="your first ICP?" visible={ctaVisible} baseDelay={350} gradient />
            </h2>

            <p
              className="text-lg text-white/35 mb-10 max-w-md mx-auto leading-relaxed mt-6"
              style={{
                opacity: ctaVisible ? 1 : 0,
                animation: ctaVisible ? "emerge 0.7s cubic-bezier(0.22,1,0.36,1) 0.5s both" : "none",
              }}
            >
              Free to start. Paid plans from $39/mo. 30-day money-back guarantee.
            </p>

            <div
              className="animate-glow-pulse inline-block rounded-xl"
              style={{
                opacity: ctaVisible ? 1 : 0,
                animation: ctaVisible
                  ? "emerge 0.7s cubic-bezier(0.22,1,0.36,1) 0.65s both, glow-pulse 3s ease-in-out 1.5s infinite"
                  : "none",
              }}
            >
              <Button
                size="lg"
                className="h-16 px-10 text-lg font-bold bg-primary text-white hover:bg-primary/90 rounded-xl hover:-translate-y-1 transition-all duration-300 group"
                onClick={() => navigate("/auth")}
              >
                Get 10 free ICP-scored leads
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1.5 transition-transform duration-200" />
              </Button>
            </div>

            <div
              className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-white/25"
              style={{
                opacity: ctaVisible ? 1 : 0,
                animation: ctaVisible ? "emerge 0.7s cubic-bezier(0.22,1,0.36,1) 0.85s both" : "none",
              }}
            >
              <span>No credit card</span>
              <span className="w-1 h-1 rounded-full bg-white/15" />
              <span>Setup in 2 min</span>
              <span className="w-1 h-1 rounded-full bg-white/15" />
              <span>30-day guarantee</span>
            </div>

            <p
              className="mt-8 text-xs text-white/15 italic max-w-sm mx-auto"
              style={{
                opacity: ctaVisible ? 1 : 0,
                animation: ctaVisible ? "emerge 0.7s cubic-bezier(0.22,1,0.36,1) 1s both" : "none",
              }}
            >
              "First sequence live in under an hour. 11 meetings in month one." — James Kim, SDR Manager, Stackline
            </p>
          </div>
        </section>
      </div>
    </>
  );
};

export default DemoPage;
