<<<<<<< HEAD
import { Button } from "@/components/ui/button";
import { ArrowRight, Play, Search, Mail, BarChart3, TrendingUp, Target, MessageSquare, Brain, Clock, Zap } from "lucide-react";
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
    { label: "Day 0: Intro email", status: "sent" },
    { label: "Day 2: Follow-up", status: "queued" },
    { label: "Day 5: Breakup email", status: "pending" },
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
=======
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

export const HeroSection = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative hero-fullscreen flex flex-col items-center justify-start overflow-hidden px-0 pt-[calc(env(safe-area-inset-top)+4.75rem)] pb-8 sm:justify-center sm:pt-[calc(env(safe-area-inset-top)+7rem)] sm:pb-20"
      aria-labelledby="hero-heading"
    >
      <div className="absolute inset-0 bg-[hsl(0,0%,3%)]" aria-hidden="true" />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
>>>>>>> origin/main
        }}
        aria-hidden="true"
      />

<<<<<<< HEAD
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
      className="relative min-h-[85vh] lg:min-h-[calc(100vh-64px)] flex items-center justify-center overflow-hidden pt-24 sm:pt-28 lg:pt-24 pb-4 sm:pb-6 lg:pb-8"
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
      {/* Slow gradient sweep */}
      <div
        className="absolute inset-0 pointer-events-none animate-hero-sweep"
        aria-hidden="true"
      />
      <div className="noise-texture" aria-hidden="true" />

      <div className="container relative z-10 mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center max-w-[1120px] mx-auto">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">

            {/* Headline */}
            <h1
              id="hero-heading"
              className={`text-3xl sm:text-4xl md:text-5xl lg:text-[3.5rem] font-bold tracking-tight mb-5 leading-[1.12] transition-all duration-700 delay-100 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            >
              Stop duct-taping tools.{" "}
              <span
                className="relative inline-block text-[1.08em] bg-gradient-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent"
                style={{
                  filter: "drop-shadow(0 0 20px hsl(261 75% 65% / 0.35))",
                }}
              >
                Close more deals.
              </span>
            </h1>

            {/* Subheadline */}
            <p
              className={`hero-description text-base sm:text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed transition-all duration-700 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            >
              SalesOS is one platform for finding verified prospects, sending AI-personalized outreach, and managing your pipeline — without Apollo, Clay, and three other subscriptions.
            </p>

            {/* CTAs */}
            <div
              className={`flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-3 transition-all duration-700 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
            >
              <div className="animated-border inline-block rounded-xl">
                <Button
                  size="lg"
                  className="h-14 px-8 text-base font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-[calc(1rem-1px)] group shadow-[0_0_30px_hsl(261_75%_65%/0.3)] hover:shadow-[0_0_50px_hsl(261_75%_65%/0.45)] hover:-translate-y-0.5 transition-all duration-200"
                  onClick={() => navigate("/auth")}
                  aria-label="Start for free"
                >
                  Start for free
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1.5 transition-transform duration-200" />
                </Button>
              </div>
              <button
                className="h-14 px-6 text-base text-muted-foreground hover:text-foreground transition-colors duration-200 relative group inline-flex items-center justify-center gap-2"
                onClick={() => document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" })}
                aria-label="Watch product demo"
                type="button"
              >
                <Play className="w-4 h-4 fill-current" />
                <span className="relative">
                  Watch Demo
                  <span className="absolute left-0 -bottom-0.5 w-0 h-px bg-primary group-hover:w-full transition-all duration-300" />
                </span>
              </button>
            </div>

            {/* Trust proof */}
            <div
              className={`flex flex-col gap-1.5 text-center lg:text-left transition-all duration-700 delay-[350ms] ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-1.5 text-sm text-muted-foreground/70">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <svg className="w-3.5 h-3.5 text-primary flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Encrypted & secure
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Clock className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  Free forever plan
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <Zap className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  Live in under 2 min
                </span>
              </div>
              <p className="text-xs text-muted-foreground/50">
                Built for founders, SDRs, and growing sales teams.
              </p>
            </div>
          </div>

          {/* Right: Dashboard mockup */}
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
=======
      {/* Left orb — multi-keyframe float */}
      <motion.div
        className="absolute bottom-[-80px] left-[-120px] h-[280px] w-[280px] rounded-full pointer-events-none sm:bottom-[-120px] sm:left-[-80px] sm:h-[600px] sm:w-[600px]"
        style={{
          background: "radial-gradient(ellipse at center, hsl(261 75% 55% / 0.18) 0%, hsl(261 75% 55% / 0.06) 50%, transparent 70%)",
          willChange: "transform",
        }}
        animate={{ y: [0, -28, 14, -8, 0], x: [0, 18, -20, 10, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      />

      {/* Right orb — offset timing */}
      <motion.div
        className="absolute bottom-[-60px] right-[-110px] h-[260px] w-[260px] rounded-full pointer-events-none sm:bottom-[-100px] sm:right-[-100px] sm:h-[500px] sm:w-[500px]"
        style={{
          background: "radial-gradient(ellipse at center, hsl(280 70% 60% / 0.14) 0%, hsl(280 70% 60% / 0.04) 50%, transparent 70%)",
          willChange: "transform",
        }}
        animate={{ y: [0, 22, -18, 12, 0], x: [0, -16, 24, -8, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut", delay: 7 }}
        aria-hidden="true"
      />

      <div
        className="absolute top-0 left-1/2 h-[220px] w-full max-w-[420px] -translate-x-1/2 pointer-events-none sm:h-[400px] sm:max-w-[800px]"
        style={{ background: "radial-gradient(ellipse at center top, hsl(261 75% 55% / 0.08) 0%, transparent 65%)" }}
        aria-hidden="true"
      />

      <div className="noise-texture" aria-hidden="true" />

      <div className="relative z-10 mx-auto flex w-full max-w-[38rem] flex-col items-center px-5 text-center sm:max-w-5xl sm:px-6">

        {/* Badge */}
        <motion.div
          className="mb-6 max-w-full sm:mb-10"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
        >
          <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] leading-tight text-white/60 sm:flex-nowrap sm:gap-2.5 sm:px-4 sm:text-xs">
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
            </span>
            <span className="font-medium text-white/80">New</span>
            <span className="text-white/70">·</span>
            <span>Intent scoring now live — know who's ready before you email</span>
          </span>
        </motion.div>

        {/* H1 — two lines spring in with stagger */}
        <h1
          id="hero-heading"
          className="font-display mb-5 max-w-[13ch] text-balance sm:mb-8 sm:max-w-none"
          style={{ fontSize: "clamp(2.05rem, 6.4vw, 5.25rem)", lineHeight: 1.02, letterSpacing: "-0.01em", fontWeight: 800 }}
        >
          <motion.span
            className="block text-white"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.1 }}
          >
            Find who to sell to.
          </motion.span>
          <motion.span
            className="block font-display italic"
            style={{
              fontStyle: "italic",
              fontWeight: 800,
              background: "linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 80% 68%) 50%, hsl(261 75% 60%) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.24 }}
          >
            Then actually sell to them.
          </motion.span>
        </h1>

        {/* Subhead */}
        <motion.p
          className="mb-7 max-w-[22rem] text-base font-light leading-relaxed text-white/55 sm:mb-12 sm:max-w-xl sm:text-xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease, delay: 0.38 }}
        >
          Describe your ideal customer once. Get ranked prospects with verified emails and a first-touch draft written for each one — ready to send in under 2 minutes.
        </motion.p>

        {/* CTAs */}
        <motion.div
          className="mb-6 flex w-full max-w-[20rem] flex-col items-center gap-3 sm:mb-8 sm:max-w-none sm:flex-row sm:justify-center sm:gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease, delay: 0.5 }}
        >
          <motion.button
            onClick={() => navigate("/auth")}
            className="cta-pill-glow inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-8 text-sm font-semibold text-white group sm:w-auto"
            style={{ background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)" }}
            aria-label="Start for free"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Find your first leads — free
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </motion.button>

          <motion.a
            href="/demo"
            className="inline-flex h-11 items-center justify-center gap-1.5 px-5 text-sm text-white/60 transition-colors duration-200 hover:text-white/80 sm:h-[52px]"
            whileHover={{ x: 3 }}
          >
            Watch a 2-min demo
            <ArrowRight className="h-3.5 w-3.5 ml-0.5" />
          </motion.a>
        </motion.div>

        <motion.p
          className="mb-3 flex max-w-[21rem] flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs leading-tight text-white/25 sm:flex-nowrap"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.65 }}
        >
          No credit card required
          <span className="w-px h-3 bg-white/20 inline-block" />
          Cancel anytime
          <span className="w-px h-3 bg-white/20 inline-block" />
          First leads in 2 minutes
        </motion.p>
      </div>
    </section>
  );
};
>>>>>>> origin/main
