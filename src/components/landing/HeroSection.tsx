import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Search, Mail, BarChart3, TrendingUp, Target, MessageSquare, Brain } from "lucide-react";
import logoSmall from "@/assets/salesos-logo-64.webp";
import { useNavigate } from "react-router-dom";
import { useEffect, useState, useRef } from "react";

// Animated counter that counts up once
const AnimatedNumber = ({ value, suffix = "" }: { value: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (started) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          const duration = 1400;
          const start = performance.now();
          const step = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const ease = 1 - Math.pow(1 - p, 3);
            setCount(Math.floor(ease * value));
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, started]);

  return <span ref={ref}>{count}{suffix}</span>;
};

// Dashboard mockup with living animations
const DashboardMockup = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [pipelineAnim, setPipelineAnim] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setActiveStep(1), 800),
      setTimeout(() => setActiveStep(2), 1600),
      setTimeout(() => setActiveStep(3), 2400),
      setTimeout(() => setPipelineAnim(true), 3000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Data refresh every 5 seconds to feel alive
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTick(t => t + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const leads = [
    { name: "J. Park", title: "VP Sales", company: "Lattice", score: 94 },
    { name: "A. Müller", title: "CRO", company: "Personio", score: 91 },
    { name: "R. Shah", title: "Head of Growth", company: "Notion", score: 87 },
  ];

  const sequenceSteps = [
    { label: "Day 0 — Intro email", status: "sent" },
    { label: "Day 2 — Follow-up", status: "queued" },
    { label: "Day 5 — Breakup email", status: "pending" },
  ];

  const pipelineStages = [
    { label: "Contacted", count: 42, color: "bg-primary/40" },
    { label: "Qualified", count: 28, color: "bg-primary/60" },
    { label: "Proposal", count: 12, color: "bg-primary/80" },
    { label: "Closed", count: 6, color: "bg-primary" },
  ];

  return (
    <div className="relative">
      {/* Ambient purple glow behind entire dashboard */}
      <div
        className="absolute -inset-8 rounded-3xl pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, hsl(261 75% 55% / 0.08) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative rounded-xl border border-border/30 bg-card/90 backdrop-blur-sm overflow-hidden shadow-2xl shadow-primary/5">
        {/* Browser chrome */}
        <div className="relative flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/20">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-primary/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="flex-1 flex justify-center">
          <div className="px-3 py-1 rounded-md bg-muted/40 text-[10px] text-muted-foreground font-mono flex items-center gap-1.5">
            <img src={logoSmall} alt="SalesOS" className="w-4 h-4 rounded-sm" />
            <span>Dashboard</span>
          </div>
          </div>
          {/* Data refresh indicator */}
          <div
            className="w-1.5 h-1.5 rounded-full bg-primary transition-opacity duration-300"
            style={{ opacity: refreshTick % 2 === 0 ? 0.8 : 0.2 }}
            aria-hidden="true"
          />
        </div>

        <div className="relative grid grid-cols-2 gap-3 p-4">
          {/* Panel 1: Lead Search */}
          <div
            className="col-span-2 rounded-lg border border-border/20 bg-background/60 p-3 transition-all duration-500"
            style={{
              opacity: activeStep >= 1 ? 1 : 0,
              transform: activeStep >= 1 ? "translateY(0)" : "translateY(8px)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">Lead Search</span>
              <div className="ml-auto text-[9px] text-muted-foreground/50 font-mono">847 results</div>
            </div>
            <div className="space-y-1.5">
              {leads.map((l, i) => (
                <div
                  key={`${i}-${refreshTick}`}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-muted/20 border border-border/10 transition-all duration-500"
                  style={{
                    opacity: activeStep >= 1 ? 1 : 0,
                    transition: `opacity 0.3s ease ${i * 120}ms`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[9px] font-bold text-primary">
                      {l.name.charAt(0)}
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-foreground">{l.name}</span>
                      <span className="text-[10px] text-muted-foreground ml-1.5">{l.title}, {l.company}</span>
                    </div>
                  </div>
                  <div className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold tabular-nums">
                    <AnimatedNumber value={l.score} suffix="%" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Panel 2: Sequence Builder */}
          <div
            className="rounded-lg border border-border/20 bg-background/60 p-3 transition-all duration-500"
            style={{
              opacity: activeStep >= 2 ? 1 : 0,
              transform: activeStep >= 2 ? "translateY(0)" : "translateY(8px)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Mail className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">Sequence</span>
            </div>
            <div className="space-y-1.5">
              {sequenceSteps.map((s, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 transition-all duration-300"
                  style={{
                    transform: activeStep >= 2 ? "translateX(0)" : "translateX(-8px)",
                    opacity: activeStep >= 2 ? 1 : 0,
                    transitionDelay: `${i * 80}ms`,
                  }}
                >
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.status === "sent" ? "bg-green-500" : s.status === "queued" ? "bg-primary animate-pulse" : "bg-muted-foreground/30"}`} />
                  <span className="text-[10px] text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Panel 3: Pipeline */}
          <div
            className="rounded-lg border border-border/20 bg-background/60 p-3 transition-all duration-500"
            style={{
              opacity: activeStep >= 3 ? 1 : 0,
              transform: activeStep >= 3 ? "translateY(0)" : "translateY(8px)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">Pipeline</span>
            </div>
            <div className="space-y-1.5">
              {pipelineStages.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${s.color} transition-all duration-1000 ease-out`}
                      style={{
                        width: pipelineAnim ? `${(s.count / 42) * 100}%` : "0%",
                        transitionDelay: `${i * 150}ms`,
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground w-16 text-right">{s.label}</span>
                  <span className="text-[10px] font-semibold text-foreground w-5 text-right tabular-nums">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Panel 4: Metrics bar */}
          <div
            className="col-span-2 grid grid-cols-4 gap-2 transition-all duration-500"
            style={{
              opacity: activeStep >= 3 ? 1 : 0,
              transform: activeStep >= 3 ? "translateY(0)" : "translateY(6px)",
            }}
          >
            {[
              { icon: Target, label: "Match Rate", val: 92, suf: "%", glow: false },
              { icon: TrendingUp, label: "Open Rate", val: 64, suf: "%", glow: false },
              { icon: MessageSquare, label: "Replies", val: 38, suf: "%", glow: false },
              { icon: Brain, label: "AI Score", val: 87, suf: "", glow: true },
            ].map((m, i) => (
              <div
                key={i}
                className={`rounded-lg border bg-background/60 p-2 text-center relative overflow-hidden ${m.glow ? "border-primary/30" : "border-border/20"}`}
              >
                {/* AI Score pulse glow */}
                {m.glow && (
                  <div
                    className="absolute inset-0 bg-primary/5 animate-pulse pointer-events-none"
                    aria-hidden="true"
                  />
                )}
                <m.icon className={`w-3 h-3 mx-auto mb-1 relative ${m.glow ? "text-primary drop-shadow-[0_0_6px_hsl(261_75%_65%/0.5)]" : "text-primary"}`} />
                <div className="text-[13px] font-bold text-foreground relative tabular-nums">
                  <AnimatedNumber value={m.val} suffix={m.suf} />
                </div>
                <div className="text-[9px] text-muted-foreground relative">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const HeroSection = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative min-h-[85vh] lg:min-h-screen flex items-center justify-center overflow-hidden pt-20 sm:pt-24 lg:pt-28 pb-8 sm:pb-12 lg:pb-16"
      aria-labelledby="hero-heading"
    >
      {/* Background layers */}
      <div className="absolute inset-0 grid-bg pointer-events-none opacity-30" aria-hidden="true" />
      <div className="absolute top-1/3 left-1/2 w-[800px] h-[600px] aurora-ambient pointer-events-none" aria-hidden="true" />
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[400px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.06) 0%, transparent 60%)" }}
        aria-hidden="true"
      />
      {/* Slow gradient sweep — subconscious movement */}
      <div
        className="absolute inset-0 pointer-events-none animate-hero-sweep"
        aria-hidden="true"
      />
      <div className="noise-texture" aria-hidden="true" />

      <div className="container relative z-10 mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center max-w-[1120px] mx-auto">
          {/* Left — Copy */}
          <div className="text-center lg:text-left">

            {/* Headline */}
            <h1
              id="hero-heading"
              className={`text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-bold tracking-tight mb-5 leading-[1.12] transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            >
              Outbound Was Never Meant to Be a Stack.{" "}
              <span
                className="relative inline-block text-[1.08em] bg-gradient-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent"
                style={{
                  filter: "drop-shadow(0 0 20px hsl(261 75% 65% / 0.35))",
                }}
              >
                Build the System.
              </span>
            </h1>

            {/* Subheadline */}
            <p
              className={`hero-description text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            >
              Stop duct-taping Apollo, Instantly, HubSpot, spreadsheets, and disconnected AI tools. SalesOS turns your outbound stack into one coordinated performance engine.
            </p>

            {/* CTAs */}
            <div
              className={`flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-4 transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            >
              <Button
                size="lg"
                className="h-14 px-8 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg group shadow-[0_0_24px_hsl(261_75%_65%/0.25)] hover:shadow-[0_0_32px_hsl(261_75%_65%/0.35)] hover:-translate-y-0.5 transition-all duration-200"
                onClick={() => navigate("/pricing")}
                aria-label="Build Your Outbound System"
              >
                Build Your Outbound System
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1.5 transition-transform duration-200" />
              </Button>
              <button
                className="h-14 px-6 text-base text-muted-foreground hover:text-foreground transition-colors duration-200 relative group inline-flex items-center justify-center gap-2"
                onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
              >
                <Play className="w-4 h-4 fill-current" />
                <span className="relative">
                  Watch Demo
                  <span className="absolute left-0 -bottom-0.5 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                </span>
              </button>
            </div>


            {/* Authority line */}
            <p
              className={`text-sm text-muted-foreground/60 text-center lg:text-left transition-all duration-700 delay-[400ms] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              Built for founders, SDRs, and high-performance sales teams.
            </p>
          </div>

          {/* Right — Dashboard mockup */}
          <div
            className={`w-full max-w-[560px] lg:max-w-none mx-auto transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
          >
            <DashboardMockup />
          </div>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" aria-hidden="true" />
    </section>
  );
};
