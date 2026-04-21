import { useEffect, useState, useRef } from "react";
import { Search, Mail, BarChart3, TrendingUp, Target, MessageSquare, Brain } from "lucide-react";
import logoSmall from "@/assets/salesos-logo-64.webp";

// Animated counter that counts up once
const AnimatedNumber = ({ value, suffix = "" }: { value: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          observer.disconnect();
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
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return <span ref={ref}>{count}{suffix}</span>;
};

// Warm-dark palette for the mockup interior
const CORAL = "hsl(14 59% 62%)";
const CORAL_SOFT = "hsl(14 59% 62% / 0.14)";
const CORAL_RING = "hsl(14 59% 62% / 0.25)";
const TEXT_HI = "hsl(34 30% 92%)";
const TEXT_MID = "hsl(30 10% 72%)";
const TEXT_LO = "hsl(30 8% 48%)";
const SURFACE = "hsl(28 8% 13%)";
const SURFACE_2 = "hsl(28 8% 16%)";
const LINE = "hsl(28 10% 22%)";

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
    { label: "Contacted", count: 42, opacity: 0.35 },
    { label: "Qualified", count: 28, opacity: 0.55 },
    { label: "Proposal", count: 12, opacity: 0.75 },
    { label: "Closed", count: 6, opacity: 1 },
  ];

  return (
    <div className="relative" style={{ background: SURFACE }}>
      {/* Window chrome */}
      <div
        className="relative flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: `1px solid ${LINE}`, background: SURFACE_2 }}
      >
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(4 60% 55% / 0.55)" }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(40 80% 55% / 0.55)" }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(142 40% 50% / 0.55)" }} />
        </div>
        <div className="flex-1 flex justify-center">
          <div
            className="px-3 py-1 rounded-md font-mono text-[10px] flex items-center gap-1.5"
            style={{ background: "hsl(28 8% 18%)", color: TEXT_MID }}
          >
            <img src={logoSmall} alt="SalesOS" className="w-4 h-4 rounded-sm" width={16} height={16} />
            <span>Dashboard</span>
          </div>
        </div>
        <div
          className="w-1.5 h-1.5 rounded-full transition-opacity duration-300"
          style={{ background: CORAL, opacity: refreshTick % 2 === 0 ? 0.85 : 0.25 }}
          aria-hidden="true"
        />
      </div>

      <div className="relative grid grid-cols-2 gap-3 p-4">
        {/* Lead Search */}
        <div
          className="col-span-2 rounded-lg p-3 transition-all duration-500"
          style={{
            border: `1px solid ${LINE}`,
            background: SURFACE_2,
            opacity: activeStep >= 1 ? 1 : 0,
            transform: activeStep >= 1 ? "translateY(0)" : "translateY(8px)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-3.5 h-3.5" style={{ color: CORAL }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_HI }}>
              Lead Search
            </span>
            <div className="ml-auto text-[9px] font-mono" style={{ color: TEXT_LO }}>847 results</div>
          </div>
          <div className="space-y-1.5">
            {leads.map((l, i) => (
              <div
                key={`${i}-${refreshTick}`}
                className="flex items-center justify-between px-2.5 py-1.5 rounded-md transition-all duration-500"
                style={{
                  background: SURFACE,
                  border: `1px solid ${LINE}`,
                  opacity: activeStep >= 1 ? 1 : 0,
                  transition: `opacity 0.3s ease ${i * 120}ms`,
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: CORAL_SOFT, color: CORAL }}
                  >
                    {l.name.charAt(0)}
                  </div>
                  <div>
                    <span className="text-[11px] font-medium" style={{ color: TEXT_HI }}>{l.name}</span>
                    <span className="text-[10px] ml-1.5" style={{ color: TEXT_MID }}>{l.title}, {l.company}</span>
                  </div>
                </div>
                <div
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums"
                  style={{ background: CORAL_SOFT, color: CORAL }}
                >
                  <AnimatedNumber value={l.score} suffix="%" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sequence */}
        <div
          className="rounded-lg p-3 transition-all duration-500"
          style={{
            border: `1px solid ${LINE}`,
            background: SURFACE_2,
            opacity: activeStep >= 2 ? 1 : 0,
            transform: activeStep >= 2 ? "translateY(0)" : "translateY(8px)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Mail className="w-3.5 h-3.5" style={{ color: CORAL }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_HI }}>Sequence</span>
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
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background:
                      s.status === "sent" ? "hsl(142 45% 52%)"
                        : s.status === "queued" ? CORAL
                        : "hsl(28 10% 42%)",
                  }}
                />
                <span className="text-[10px]" style={{ color: TEXT_MID }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline */}
        <div
          className="rounded-lg p-3 transition-all duration-500"
          style={{
            border: `1px solid ${LINE}`,
            background: SURFACE_2,
            opacity: activeStep >= 3 ? 1 : 0,
            transform: activeStep >= 3 ? "translateY(0)" : "translateY(8px)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-3.5 h-3.5" style={{ color: CORAL }} />
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: TEXT_HI }}>Pipeline</span>
          </div>
          <div className="space-y-1.5">
            {pipelineStages.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div
                  className="flex-1 h-1.5 rounded-full overflow-hidden"
                  style={{ background: "hsl(28 10% 20%)" }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{
                      width: pipelineAnim ? `${(s.count / 42) * 100}%` : "0%",
                      background: CORAL,
                      opacity: s.opacity,
                      transitionDelay: `${i * 150}ms`,
                    }}
                  />
                </div>
                <span className="text-[10px] w-16 text-right" style={{ color: TEXT_MID }}>{s.label}</span>
                <span className="text-[10px] font-semibold w-5 text-right tabular-nums" style={{ color: TEXT_HI }}>
                  {s.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Metric row */}
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
              className="rounded-lg p-2 text-center relative overflow-hidden"
              style={{
                border: `1px solid ${m.glow ? CORAL_RING : LINE}`,
                background: SURFACE_2,
              }}
            >
              {m.glow && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: CORAL_SOFT }}
                  aria-hidden="true"
                />
              )}
              <m.icon className="w-3 h-3 mx-auto mb-1 relative" style={{ color: CORAL }} />
              <div className="text-[13px] font-bold relative tabular-nums" style={{ color: TEXT_HI }}>
                <AnimatedNumber value={m.val} suffix={m.suf} />
              </div>
              <div className="text-[9px] relative" style={{ color: TEXT_MID }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardMockup;
