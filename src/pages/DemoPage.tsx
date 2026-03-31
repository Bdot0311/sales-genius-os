import { useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/seo";

// ─── Scroll-reveal hook ───────────────────────────────────────────────────────
const useReveal = (threshold = 0.25) => {
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

// ─── Typewriter ───────────────────────────────────────────────────────────────
const Typewriter = ({ text, active, speed = 18 }: { text: string; active: boolean; speed?: number }) => {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!active) { setTyped(""); return; }
    let i = 0;
    const t = setInterval(() => {
      if (i < text.length) { setTyped(text.slice(0, i + 1)); i++; }
      else clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [active, text, speed]);
  return (
    <>
      {typed}
      {active && typed.length < text.length && (
        <span className="inline-block w-[2px] h-[1em] bg-primary align-middle ml-0.5 animate-pulse" />
      )}
    </>
  );
};

// ─── Chapter 1: Plain-English Search ─────────────────────────────────────────
const SearchScene = ({ active }: { active: boolean }) => (
  <div className="rounded-2xl border border-white/8 bg-black/60 backdrop-blur-xl overflow-hidden shadow-[0_0_80px_hsl(261_75%_55%/0.15)]">
    <div className="px-5 py-3 border-b border-white/8 flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
      <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
      <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
      <span className="ml-3 text-[11px] text-white/30 font-mono">ICP Builder</span>
    </div>
    <div className="p-6 md:p-8">
      <p className="text-xs text-primary/70 uppercase tracking-widest mb-4">Describe your ideal customer</p>
      <div className="text-xl md:text-2xl font-medium text-white leading-relaxed min-h-[80px]">
        <Typewriter
          text="Heads of Sales at NYC B2B SaaS companies with 10–100 employees hiring SDRs"
          active={active}
        />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {["Title", "Industry", "Company size", "Location", "Hiring signal"].map((tag) => (
          <span key={tag} className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-white/50">
            {tag}
          </span>
        ))}
      </div>
      <div className={`mt-6 transition-all duration-700 delay-[2000ms] ${active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
        <div className="flex items-center gap-2 text-xs text-white/30 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Matching leads…
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-purple-400 transition-all duration-[2500ms] delay-[2200ms]"
            style={{ width: active ? "100%" : "0%" }}
          />
        </div>
      </div>
    </div>
  </div>
);

// ─── Chapter 2: Ranked Leads ──────────────────────────────────────────────────
const leads = [
  { name: "Jordan Park", role: "Head of Sales · Northline", score: 97, delay: 0 },
  { name: "Rina Shah", role: "VP Revenue · SignalFox", score: 91, delay: 120 },
  { name: "Alex Müller", role: "Director of Sales · GraphiteIQ", score: 88, delay: 240 },
];
const LeadsScene = ({ active }: { active: boolean }) => (
  <div className="space-y-3">
    {leads.map((l) => (
      <div
        key={l.name}
        className="flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-black/60 backdrop-blur-xl px-5 py-4 transition-all duration-700"
        style={{
          opacity: active ? 1 : 0,
          transform: active ? "translateY(0)" : "translateY(20px)",
          transitionDelay: `${l.delay}ms`,
        }}
      >
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
            {l.name.split(" ").map(w => w[0]).join("")}
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{l.name}</p>
            <p className="text-xs text-white/40">{l.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="hidden sm:flex h-1.5 w-20 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-purple-400 transition-all duration-1000"
              style={{ width: active ? `${l.score}%` : "0%", transitionDelay: `${l.delay + 300}ms` }}
            />
          </div>
          <span className="text-sm font-bold text-primary tabular-nums">{l.score}</span>
        </div>
      </div>
    ))}
    <div
      className="mt-1 px-5 py-3 rounded-xl border border-white/5 bg-white/[0.02] transition-all duration-500 delay-[500ms]"
      style={{ opacity: active ? 1 : 0 }}
    >
      <p className="text-xs text-white/25 text-center">+ 841 more matches ranked by ICP fit</p>
    </div>
  </div>
);

// ─── Chapter 3: Personalized Outreach ────────────────────────────────────────
const emailLines = [
  "Hey Jordan — noticed Northline is hiring SDRs and growing the sales team in NYC.",
  "That usually means more pressure to build a repeatable prospecting workflow fast.",
  "SalesOS helps teams go from ICP to qualified outreach in under an hour.",
  "Worth a quick look?",
];
const OutreachScene = ({ active }: { active: boolean }) => {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!active) { setShown(0); return; }
    let i = 0;
    const t = setInterval(() => {
      i++;
      setShown(i);
      if (i >= emailLines.length) clearInterval(t);
    }, 600);
    return () => clearInterval(t);
  }, [active]);

  return (
    <div className="rounded-2xl border border-white/8 bg-black/60 backdrop-blur-xl overflow-hidden shadow-[0_0_80px_hsl(261_75%_55%/0.12)]">
      <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs text-white/40">Outreach draft · Jordan Park</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium">Personalized</span>
      </div>
      <div className="p-6 md:p-8 space-y-1">
        <p className="text-xs text-white/25 mb-5">Subject: Quick idea for Northline's outbound hiring push</p>
        <div className="space-y-4 text-base md:text-lg text-white/75 leading-relaxed">
          {emailLines.map((line, i) => (
            <p
              key={i}
              className="transition-all duration-500"
              style={{
                opacity: shown > i ? 1 : 0,
                transform: shown > i ? "translateY(0)" : "translateY(10px)",
              }}
            >
              {line}
            </p>
          ))}
        </div>
        <div
          className="mt-6 flex gap-2 transition-all duration-500 delay-[2400ms]"
          style={{ opacity: shown >= emailLines.length ? 1 : 0 }}
        >
          <button className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 transition-colors">
            Send
          </button>
          <button className="px-4 py-2 rounded-lg border border-white/10 text-white/50 text-xs hover:text-white/70 transition-colors">
            Edit draft
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Chapter 4: Pipeline ──────────────────────────────────────────────────────
const pipelineStages = [
  { label: "Contacted", count: 247, pct: 100 },
  { label: "Opened", count: 158, pct: 64 },
  { label: "Replied", count: 28, pct: 28 },
  { label: "Meeting", count: 11, pct: 11 },
];
const PipelineScene = ({ active }: { active: boolean }) => (
  <div className="rounded-2xl border border-white/8 bg-black/60 backdrop-blur-xl overflow-hidden shadow-[0_0_80px_hsl(261_75%_55%/0.12)]">
    <div className="px-5 py-3 border-b border-white/8 flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
      <span className="text-xs text-white/40">Pipeline overview · Q1 2026</span>
    </div>
    <div className="p-6 md:p-8 space-y-5">
      {pipelineStages.map((s, i) => (
        <div key={s.label} className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-white/50">{s.label}</span>
            <span className="text-white font-semibold tabular-nums">{s.count}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-purple-400 transition-all duration-1000"
              style={{
                width: active ? `${s.pct}%` : "0%",
                transitionDelay: `${i * 150}ms`,
              }}
            />
          </div>
        </div>
      ))}
      <div
        className="grid grid-cols-3 gap-3 pt-4 border-t border-white/5 transition-all duration-700 delay-700"
        style={{ opacity: active ? 1 : 0 }}
      >
        {[["11.4%", "Reply rate"], ["< 1 hr", "To first send"], ["3.1×", "Faster pipeline"]].map(([val, lbl]) => (
          <div key={lbl} className="text-center">
            <p className="text-xl font-extrabold bg-gradient-to-r from-primary to-purple-300 bg-clip-text text-transparent">{val}</p>
            <p className="text-[10px] text-white/30 mt-0.5">{lbl}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ─── Chapter config ───────────────────────────────────────────────────────────
const chapters = [
  {
    num: "01",
    kicker: "Find",
    headline: "Describe who you want.",
    sub: "No boolean search. No filters. Just plain English — SalesOS handles the rest.",
    Scene: SearchScene,
  },
  {
    num: "02",
    kicker: "Prioritize",
    headline: "The right leads surface first.",
    sub: "Every prospect scored 0–100 against your ICP. Spend time on accounts that are actually worth it.",
    Scene: LeadsScene,
  },
  {
    num: "03",
    kicker: "Reach out",
    headline: "Turn context into outreach.",
    sub: "AI writes each email from their profile. Five quality checks run before you send a single word.",
    Scene: OutreachScene,
  },
  {
    num: "04",
    kicker: "Close",
    headline: "One place for everything after.",
    sub: "Pipeline, replies, follow-ups. One system keeps it all moving without juggling five tools.",
    Scene: PipelineScene,
  },
];

// ─── Chapter Section ──────────────────────────────────────────────────────────
const ChapterSection = ({ chapter, index }: { chapter: typeof chapters[0]; index: number }) => {
  const { ref, visible } = useReveal(0.2);
  const flip = index % 2 === 1;

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex items-center py-24 md:py-32 overflow-hidden"
    >
      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          [flip ? "right" : "left"]: "-10%",
          top: "20%",
          width: "50vw",
          height: "50vw",
          maxWidth: 700,
          maxHeight: 700,
          background: "radial-gradient(circle, hsl(261 75% 55% / 0.08) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-6 relative z-10">
        <div className={`grid lg:grid-cols-2 gap-12 lg:gap-20 items-center max-w-[1120px] mx-auto ${flip ? "lg:grid-flow-col-dense" : ""}`}>
          {/* Copy */}
          <div className={flip ? "lg:col-start-2" : ""}>
            <div
              className="transition-all duration-700"
              style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(32px)" }}
            >
              <div className="flex items-center gap-3 mb-6">
                <span className="text-xs font-mono text-primary/60 tracking-widest">{chapter.num}</span>
                <div className="h-px flex-1 max-w-[40px] bg-primary/20" />
                <span className="text-xs font-semibold text-primary uppercase tracking-widest">{chapter.kicker}</span>
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.05] mb-6">
                {chapter.headline}
              </h2>
              <p className="text-lg text-white/50 leading-relaxed max-w-md">
                {chapter.sub}
              </p>
            </div>
          </div>

          {/* Visual */}
          <div
            className={`${flip ? "lg:col-start-1" : ""} transition-all duration-700 delay-200`}
            style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0) scale(1)" : "translateY(24px) scale(0.97)" }}
          >
            <chapter.Scene active={visible} />
          </div>
        </div>
      </div>

      {/* Bottom hairline */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </section>
  );
};

// ─── Results Bar ─────────────────────────────────────────────────────────────
const ResultsBar = () => {
  const { ref, visible } = useReveal(0.2);
  return (
    <section ref={ref} className="relative py-24 border-y border-white/5 overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 50%, hsl(261 75% 55% / 0.06) 0%, transparent 60%)" }}
        aria-hidden="true"
      />
      <div className="container mx-auto px-6">
        <div
          className="text-center mb-14 transition-all duration-700"
          style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)" }}
        >
          <p className="text-xs font-semibold text-white/25 uppercase tracking-widest mb-3">From our early access cohort</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Real results. Real teams.</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-px bg-white/5 rounded-2xl overflow-hidden border border-white/5 max-w-3xl mx-auto">
          {[
            { stat: "11.4%", label: "Avg. reply rate", sub: "up from 2.8% pre-switch", delay: 0 },
            { stat: "< 1 hr", label: "To first sequence live", sub: "from signup to sending", delay: 100 },
            { stat: "6.1%→1.3%", label: "Bounce rate drop", sub: "in the first two weeks", delay: 200 },
          ].map((s) => (
            <div
              key={s.label}
              className="flex flex-col items-center gap-2 text-center bg-black/40 px-8 py-10 hover:bg-white/[0.03] transition-all duration-700"
              style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transitionDelay: `${s.delay}ms` }}
            >
              <span className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-purple-300 bg-clip-text text-transparent tabular-nums">
                {s.stat}
              </span>
              <span className="text-sm font-semibold text-white/70">{s.label}</span>
              <span className="text-xs text-white/25">{s.sub}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────
const DemoPage = () => {
  const navigate = useNavigate();
  const { ref: heroRef, visible: heroVisible } = useReveal(0.1);
  const { ref: ctaRef, visible: ctaVisible } = useReveal(0.2);

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
          {/* Background layers */}
          <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" aria-hidden="true" />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] pointer-events-none"
            style={{ background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.12) 0%, transparent 60%)" }}
            aria-hidden="true"
          />
          {/* Grain */}
          <div className="noise-texture" aria-hidden="true" />

          <div
            ref={heroRef}
            className="relative z-10 max-w-5xl mx-auto"
          >
            {/* Eyebrow */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-8 transition-all duration-700"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0)" : "translateY(16px)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Interactive walkthrough
            </div>

            {/* Headline */}
            <h1
              className="text-5xl sm:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.02] mb-6 transition-all duration-700 delay-100"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0)" : "translateY(24px)" }}
            >
              From idea
              <br />
              <span
                className="bg-gradient-to-r from-primary via-purple-400 to-primary/70 bg-clip-text text-transparent"
                style={{ filter: "drop-shadow(0 0 30px hsl(261 75% 65% / 0.4))" }}
              >
                to pipeline.
              </span>
            </h1>

            {/* Subheadline */}
            <p
              className="text-xl sm:text-2xl text-white/50 max-w-2xl mx-auto leading-relaxed mb-12 transition-all duration-700 delay-200"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0)" : "translateY(24px)" }}
            >
              Four chapters. One workflow. No spreadsheets.
            </p>

            {/* CTA */}
            <div
              className="flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-300"
              style={{ opacity: heroVisible ? 1 : 0, transform: heroVisible ? "translateY(0)" : "translateY(24px)" }}
            >
              <Button
                size="lg"
                className="h-14 px-8 text-base font-semibold bg-primary text-white hover:bg-primary/90 shadow-[0_0_40px_hsl(261_75%_65%/0.35)] hover:shadow-[0_0_60px_hsl(261_75%_65%/0.5)] hover:-translate-y-0.5 transition-all duration-200 group"
                onClick={() => navigate("/auth")}
              >
                Get 10 free ICP-scored leads
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <button
                className="text-white/40 hover:text-white/70 text-sm transition-colors flex items-center gap-2"
                onClick={() => document.getElementById("chapter-01")?.scrollIntoView({ behavior: "smooth" })}
              >
                Scroll to see how it works
                <ChevronDown className="w-4 h-4 animate-bounce" />
              </button>
            </div>
          </div>

          {/* Scroll indicator line */}
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-20">
            <div className="w-px h-16 bg-gradient-to-b from-white/60 to-transparent" />
          </div>
        </section>

        {/* ── CHAPTERS ──────────────────────────────────────────────────── */}
        <div id="chapter-01">
          {chapters.map((chapter, i) => (
            <ChapterSection key={chapter.num} chapter={chapter} index={i} />
          ))}
        </div>

        {/* ── RESULTS BAR ───────────────────────────────────────────────── */}
        <ResultsBar />

        {/* ── FINAL CTA ─────────────────────────────────────────────────── */}
        <section
          ref={ctaRef}
          className="relative py-40 flex items-center justify-center text-center px-6 overflow-hidden"
        >
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] pointer-events-none"
            style={{ background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.14) 0%, transparent 60%)" }}
            aria-hidden="true"
          />
          <div className="noise-texture" aria-hidden="true" />

          <div
            className="relative z-10 max-w-3xl mx-auto transition-all duration-700"
            style={{ opacity: ctaVisible ? 1 : 0, transform: ctaVisible ? "translateY(0)" : "translateY(32px)" }}
          >
            <h2 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.02] text-white mb-6">
              Ready to run{" "}
              <span
                className="bg-gradient-to-r from-primary via-purple-400 to-primary/70 bg-clip-text text-transparent"
                style={{ filter: "drop-shadow(0 0 24px hsl(261 75% 65% / 0.35))" }}
              >
                your first ICP?
              </span>
            </h2>
            <p className="text-lg text-white/45 mb-10 max-w-lg mx-auto leading-relaxed">
              Free to start. Paid plans from $39/mo. 30-day money-back guarantee.
            </p>

            <div className="animated-border inline-block rounded-xl">
              <Button
                size="lg"
                className="h-16 px-10 text-lg font-semibold bg-primary text-white hover:bg-primary/90 rounded-[calc(0.75rem-1px)] shadow-[0_0_40px_hsl(261_75%_65%/0.35)] hover:shadow-[0_0_60px_hsl(261_75%_65%/0.5)] hover:-translate-y-1 transition-all duration-300 group"
                onClick={() => navigate("/auth")}
              >
                Get 10 free ICP-scored leads
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1.5 transition-transform duration-200" />
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-white/30">
              <span>No credit card required</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>Setup in 2 min</span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span>30-day money-back guarantee</span>
            </div>

            <p className="mt-8 text-xs text-white/20 italic">
              "First sequence live in under an hour. 11 meetings in month one." — James Kim, SDR Manager, Stackline
            </p>
          </div>
        </section>
      </div>
    </>
  );
};

export default DemoPage;
