import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";

const scenes = [
  {
    id: 0,
    label: "Search",
    kicker: "Start with intent",
    title: "Describe who you want to reach.",
    subtitle: "SalesOS turns plain-English targeting into a cleaner lead set.",
  },
  {
    id: 1,
    label: "Leads",
    kicker: "See the shortlist",
    title: "The right accounts surface first.",
    subtitle: "Not a giant list. A tighter one with context built in.",
  },
  {
    id: 2,
    label: "Outreach",
    kicker: "Use the context",
    title: "Turn context into outreach.",
    subtitle: "Faster drafts. More relevant first touches. Less blank-page work.",
  },
  {
    id: 3,
    label: "Pipeline",
    kicker: "Keep it moving",
    title: "Move from prospecting to pipeline.",
    subtitle: "The same workflow keeps lead review, outreach, and momentum connected.",
  },
];

const query = "Heads of sales at NYC B2B SaaS companies with 10–100 employees hiring SDRs";

const SearchVisual = ({ active }: { active: boolean }) => {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!active) {
      setTyped("");
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      if (i < query.length) {
        setTyped(query.slice(0, i + 1));
        i += 1;
      } else {
        clearInterval(timer);
      }
    }, 15);
    return () => clearInterval(timer);
  }, [active]);

  return (
    <div className="relative min-h-[420px] md:min-h-[520px] rounded-[32px] overflow-hidden bg-white border border-primary/10 shadow-[0_30px_100px_rgba(121,91,255,0.10)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(121,91,255,0.10),transparent_34%),linear-gradient(to_bottom,rgba(121,91,255,0.03),transparent_28%)]" />
      <div className="relative z-10 h-full flex items-center justify-center p-8 md:p-12">
        <div className="w-full max-w-4xl">
          <div className="mb-6 inline-flex rounded-full border border-primary/12 bg-primary/[0.04] px-3 py-1.5 text-xs font-medium text-primary">
            Plain-English search
          </div>
          <div className="rounded-[28px] border border-primary/10 bg-[#faf9ff] p-6 md:p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
            <div className="text-sm text-foreground/45 mb-4">Describe your ideal customer</div>
            <div className="text-2xl md:text-4xl font-medium tracking-tight leading-tight text-foreground min-h-[92px]">
              {typed}
              <span className={`inline-block ml-1 w-[2px] h-8 md:h-10 bg-primary ${active ? 'animate-pulse' : 'opacity-0'}`} />
            </div>
            <div className="mt-8 flex flex-wrap gap-3 text-sm text-foreground/60">
              {['Title', 'Industry', 'Company size', 'Hiring signal'].map((item) => (
                <div key={item} className="rounded-full bg-white border border-primary/8 px-4 py-2 shadow-sm">{item}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LeadsVisual = ({ active }: { active: boolean }) => {
  const cards = [
    ['Jordan Park', 'Head of Sales · Northline', 'High fit'],
    ['Rina Shah', 'VP Revenue · SignalFox', 'Good fit'],
    ['Alex Müller', 'Director of Sales · GraphiteIQ', 'Good fit'],
  ];

  return (
    <div className="relative min-h-[420px] md:min-h-[520px] rounded-[32px] overflow-hidden bg-white border border-primary/10 shadow-[0_30px_100px_rgba(121,91,255,0.10)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(121,91,255,0.08),transparent_28%),radial-gradient(circle_at_82%_80%,rgba(121,91,255,0.06),transparent_32%)]" />
      <div className="relative z-10 p-8 md:p-12 h-full flex items-center">
        <div className="w-full space-y-4">
          {cards.map(([name, meta, fit], index) => (
            <div
              key={name}
              className={`rounded-[28px] bg-white border border-primary/8 px-6 py-5 flex items-center justify-between gap-4 shadow-[0_18px_50px_rgba(121,91,255,0.06)] transition-all duration-700 ${
                active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
              }`}
              style={{ transitionDelay: `${index * 140}ms` }}
            >
              <div className="min-w-0">
                <div className="text-xl md:text-2xl font-semibold text-foreground truncate">{name}</div>
                <div className="text-sm md:text-base text-foreground/50 truncate">{meta}</div>
              </div>
              <div className="rounded-full bg-primary/10 text-primary px-3 py-1.5 text-xs md:text-sm font-medium whitespace-nowrap">
                {fit}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const OutreachVisual = ({ active }: { active: boolean }) => {
  const lines = [
    "Hey Jordan — noticed Northline is hiring SDRs and growing the sales team in NYC.",
    "That usually means more pressure to build a repeatable prospecting workflow fast.",
    "SalesOS helps teams describe their ICP in plain English, find better-fit leads, and move into outreach faster.",
  ];
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (!active) {
      setVisible(0);
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setVisible(i);
      if (i >= lines.length) clearInterval(timer);
    }, 220);
    return () => clearInterval(timer);
  }, [active]);

  return (
    <div className="relative min-h-[420px] md:min-h-[520px] rounded-[32px] overflow-hidden bg-white border border-primary/10 shadow-[0_30px_100px_rgba(121,91,255,0.10)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(121,91,255,0.08),transparent_34%)]" />
      <div className="relative z-10 p-8 md:p-12 h-full flex items-center justify-center">
        <div className="w-full max-w-4xl rounded-[30px] border border-primary/10 bg-[#faf9ff] overflow-hidden shadow-[0_18px_60px_rgba(121,91,255,0.06)]">
          <div className="px-6 py-4 border-b border-primary/8 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-foreground/85">Outreach draft</div>
              <div className="text-xs text-foreground/45">Built from lead context</div>
            </div>
            <div className="rounded-full bg-primary/10 text-primary px-3 py-1.5 text-xs font-medium">Personalized</div>
          </div>
          <div className="px-6 md:px-8 py-6 md:py-8">
            <div className="text-sm text-foreground/42 mb-4">Subject: Quick idea for Northline&apos;s outbound hiring push</div>
            <div className="space-y-4 text-base md:text-lg leading-relaxed text-foreground/82">
              {lines.map((line, index) => (
                <p key={index} className={`transition-all duration-500 ${visible > index ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PipelineVisual = ({ active }: { active: boolean }) => {
  const bars = [30, 54, 74, 92];
  const labels = ['Contacted', 'Qualified', 'Proposal', 'Closed'];

  return (
    <div className="relative min-h-[420px] md:min-h-[520px] rounded-[32px] overflow-hidden bg-white border border-primary/10 shadow-[0_30px_100px_rgba(121,91,255,0.10)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_70%,rgba(121,91,255,0.08),transparent_36%)]" />
      <div className="relative z-10 p-8 md:p-12 h-full flex items-center justify-center">
        <div className="w-full max-w-5xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {[["247", "Leads"], ["34", "Meetings"], ["$89K", "Revenue"], ["32%", "Conv. Rate"]].map(([value, label], index) => (
              <div key={label} className={`rounded-[28px] bg-white border border-primary/8 px-5 py-5 text-center shadow-[0_18px_50px_rgba(121,91,255,0.06)] transition-all duration-700 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`} style={{ transitionDelay: `${index * 120}ms` }}>
                <div className="text-2xl md:text-3xl font-semibold text-foreground">{value}</div>
                <div className="text-sm text-foreground/45 mt-1">{label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-[30px] bg-[#faf9ff] border border-primary/10 p-6 md:p-8 shadow-[0_18px_60px_rgba(121,91,255,0.06)]">
            <div className="grid grid-cols-4 gap-3 items-end h-48 md:h-56">
              {bars.map((height, index) => (
                <div key={labels[index]} className="flex flex-col items-center justify-end h-full gap-3">
                  <div className="w-full h-full rounded-[24px] bg-white border border-primary/8 overflow-hidden flex items-end">
                    <div
                      className="w-full rounded-[20px] bg-gradient-to-t from-primary/65 to-accent/55 transition-all duration-1000"
                      style={{ height: active ? `${height}%` : '6%', transitionDelay: `${index * 120}ms` }}
                    />
                  </div>
                  <span className="text-xs md:text-sm text-foreground/48">{labels[index]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const visuals = [SearchVisual, LeadsVisual, OutreachVisual, PipelineVisual];

export const Demo = () => {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useState(() => ({ current: null as HTMLElement | null }))[0];

  const duration = 4200;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisible(true);
    }, { threshold: 0.2 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    if (!playing || !visible) return;
    setProgress(0);
    const start = Date.now();
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min((elapsed / duration) * 100, 100));
    }, 35);
    const timer = setTimeout(() => {
      setTransitioning(true);
      setTimeout(() => {
        setCurrent((prev) => (prev + 1) % scenes.length);
        setTransitioning(false);
      }, 220);
    }, duration);
    return () => {
      clearInterval(progressTimer);
      clearTimeout(timer);
    };
  }, [current, playing, visible]);

  const goTo = (index: number) => {
    setTransitioning(true);
    setTimeout(() => {
      setCurrent(index);
      setTransitioning(false);
    }, 220);
  };

  const Visual = visuals[current];
  const scene = scenes[current];

  return (
    <section ref={(node) => (ref.current = node)} className="relative py-8 md:py-10 overflow-hidden bg-[linear-gradient(to_bottom,rgba(255,255,255,0.75),rgba(246,245,255,0.55))]">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(121,91,255,0.05),transparent_58%)]" />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="mb-8 px-1 text-center">
          <p className="text-[11px] uppercase tracking-[0.24em] text-primary/75 mb-3">{scene.kicker}</p>
          <h3 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight text-foreground">
            {scene.title}
          </h3>
          <p className="mt-3 text-lg md:text-xl text-foreground/56 max-w-2xl mx-auto leading-relaxed">
            {scene.subtitle}
          </p>
        </div>

        <div className="mb-6 h-[2px] rounded-full bg-primary/8 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary via-primary/70 to-accent transition-all duration-75" style={{ width: `${progress}%` }} />
        </div>

        <div className={`transition-all duration-300 ${transitioning ? 'opacity-0 scale-[0.992]' : 'opacity-100 scale-100'}`}>
          <Visual active={visible && !transitioning} />
        </div>

        <div className="mt-6 grid grid-cols-4 gap-2 md:gap-3">
          {scenes.map((item, index) => (
            <button
              key={item.id}
              onClick={() => goTo(index)}
              className={`rounded-2xl border px-4 py-3 text-left transition-all duration-300 ${
                index === current
                  ? 'border-primary/18 bg-white shadow-[0_14px_40px_rgba(121,91,255,0.08)]'
                  : 'border-primary/8 bg-white/70 hover:bg-white'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.18em] ${index === current ? 'text-primary' : 'text-foreground/28'}`}>
                {item.label}
              </p>
              <p className={`mt-1 text-xs md:text-sm font-medium leading-snug ${index === current ? 'text-foreground' : 'text-foreground/62'}`}>
                {item.title}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => goTo((current - 1 + scenes.length) % scenes.length)} className="text-foreground/58 hover:text-foreground hover:bg-primary/[0.04]">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPlaying((prev) => !prev)} className="border-primary/10 bg-white/80 text-foreground hover:bg-white">
            {playing ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goTo((current + 1) % scenes.length)} className="text-foreground/58 hover:text-foreground hover:bg-primary/[0.04]">
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

        <div className="mt-10 text-center">
          <a href="/pricing" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-7 py-3 text-sm font-semibold text-primary-foreground shadow-[0_18px_50px_rgba(121,91,255,0.18)] transition-opacity hover:opacity-90">
            View plans
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
};
