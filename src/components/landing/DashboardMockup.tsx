import { useEffect, useState } from "react";
import { Search, Mail, BarChart3, TrendingUp, Target, MessageSquare, Brain } from "lucide-react";
import logoSmall from "@/assets/outreign-logo-64.webp";

const StaticNumber = ({ value, suffix = "" }: { value: number; suffix?: string }) => (
  <span>{value}{suffix}</span>
);

const DashboardMockup = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [pipelineAnim, setPipelineAnim] = useState(false);

  useEffect(() => {
    const timers = [
      setTimeout(() => setActiveStep(1), 800),
      setTimeout(() => setActiveStep(2), 1600),
      setTimeout(() => setActiveStep(3), 2400),
      setTimeout(() => setPipelineAnim(true), 3000),
    ];
    return () => timers.forEach(clearTimeout);
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
      <div
        className="absolute -inset-8 rounded-3xl pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, hsl(261 75% 55% / 0.08) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative rounded-xl border border-border/30 bg-card/90 backdrop-blur-sm overflow-hidden shadow-2xl shadow-primary/5">
        <div className="relative flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-muted/20">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-primary/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="flex-1 flex justify-center">
          <div className="px-3 py-1 rounded-md bg-muted/40 text-[10px] text-muted-foreground font-mono flex items-center gap-1.5">
            <img src={logoSmall} alt="OutReign product logo" className="w-4 h-4 rounded-sm" width={16} height={16} />

            <span>Dashboard</span>
          </div>
          </div>
          <div
            className="w-1.5 h-1.5 rounded-full bg-primary transition-opacity duration-300"
              style={{ opacity: 0.8 }}
            aria-hidden="true"
          />
        </div>

        <div className="relative grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 sm:p-4">
          <div
            className="rounded-lg border border-border/20 bg-background/60 p-3 transition-all duration-500 sm:col-span-2"
            style={{
              opacity: activeStep >= 1 ? 1 : 0,
              transform: activeStep >= 1 ? "translateY(0)" : "translateY(8px)",
            }}
          >
              <div className="flex flex-wrap items-center gap-2 mb-2">
              <Search className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">Lead Search</span>
              <div className="ml-auto text-[9px] text-muted-foreground font-mono">847 results</div>
            </div>
            <div className="space-y-1.5">
              {leads.map((l, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-muted/20 border border-border/10 transition-all duration-500"
                  style={{
                    opacity: activeStep >= 1 ? 1 : 0,
                    transition: `opacity 0.3s ease ${i * 120}ms`,
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center text-[9px] font-bold text-primary">
                      {l.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-medium text-foreground">{l.name}</span>
                      <span className="ml-1.5 text-[10px] text-muted-foreground">{l.title}, {l.company}</span>
                    </div>
                  </div>
                  <div className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold tabular-nums">
                    <StaticNumber value={l.score} suffix="%" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-lg border border-border/20 bg-background/60 p-3 transition-all duration-500"
            style={{
              opacity: activeStep >= 2 ? 1 : 0,
              transform: activeStep >= 2 ? "translateY(0)" : "translateY(8px)",
            }}
          >
              <div className="flex flex-wrap items-center gap-2 mb-2">
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

          <div
            className="rounded-lg border border-border/20 bg-background/60 p-3 transition-all duration-500"
            style={{
              opacity: activeStep >= 3 ? 1 : 0,
              transform: activeStep >= 3 ? "translateY(0)" : "translateY(8px)",
            }}
          >
              <div className="flex flex-wrap items-center gap-2 mb-2">
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

          <div
            className="grid grid-cols-2 gap-2 transition-all duration-500 sm:col-span-2 sm:grid-cols-4"
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
                {m.glow && (
                  <div
                    className="absolute inset-0 bg-primary/5 animate-pulse pointer-events-none"
                    aria-hidden="true"
                  />
                )}
                <m.icon className={`w-3 h-3 mx-auto mb-1 relative ${m.glow ? "text-primary drop-shadow-[0_0_6px_hsl(261_75%_65%/0.5)]" : "text-primary"}`} />
                <div className="text-[13px] font-bold text-foreground relative tabular-nums">
                  <StaticNumber value={m.val} suffix={m.suf} />
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

export default DashboardMockup;
