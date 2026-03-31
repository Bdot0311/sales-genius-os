import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Mail,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Play,
  Pause,
} from "lucide-react";

const scenes = [
  {
    id: 0,
    eyebrow: "01",
    title: "Type the target.",
    subtitle: "Watch the market narrow.",
    blurb: "Intent in. Qualified signal out.",
  },
  {
    id: 1,
    eyebrow: "02",
    title: "The right leads surface.",
    subtitle: "Not a giant list. A sharper one.",
    blurb: "See who matters first.",
  },
  {
    id: 2,
    eyebrow: "03",
    title: "Context becomes outreach.",
    subtitle: "Fast. Specific. Usable.",
    blurb: "Lead context becomes outbound motion.",
  },
  {
    id: 3,
    eyebrow: "04",
    title: "Momentum becomes pipeline.",
    subtitle: "One system. Less drag.",
    blurb: "The motion keeps moving.",
  },
  {
    id: 4,
    eyebrow: "05",
    title: "Less wasted motion.",
    subtitle: "More pipeline movement.",
    blurb: "That is the point of SalesOS.",
  },
];

const TypeScene = ({ active }: { active: boolean }) => {
  const query = "Heads of sales at NYC B2B SaaS companies with 10–100 employees hiring SDRs";
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!active) {
      setTyped("");
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      if (i < query.length) {
        setTyped(query.slice(0, i + 1));
        i += 1;
      } else {
        clearInterval(interval);
      }
    }, 15);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className="relative min-h-[440px] md:min-h-[540px] overflow-hidden rounded-[28px] border border-white/10 bg-[#05060a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(137,92,255,0.24),transparent_36%),radial-gradient(circle_at_50%_85%,rgba(255,255,255,0.04),transparent_40%)]" />
      <div className="absolute inset-0 opacity-35 bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.02)_48%,transparent)]" />
      <div className="relative z-10 h-full flex items-center justify-center p-8 md:p-12">
        <div className="w-full max-w-4xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/18 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-[0_0_20px_rgba(120,76,255,0.12)]">
            <Search className="w-3.5 h-3.5" />
            Search
          </div>
          <div className="rounded-[26px] border border-white/10 bg-white/[0.035] backdrop-blur-2xl p-6 md:p-8 shadow-[0_0_110px_rgba(120,76,255,0.14)]">
            <div className="mb-5 flex items-center gap-3 text-white/55 text-sm">
              <Sparkles className="w-4 h-4 text-primary" />
              Plain-English input
            </div>
            <div className="min-h-[84px] text-2xl md:text-4xl font-medium tracking-tight leading-tight text-white">
              {typed}
              <span className={`ml-1 inline-block h-8 w-[2px] bg-primary md:h-10 ${active ? 'animate-pulse' : 'opacity-0'}`} />
            </div>
            <div className="mt-8 flex flex-wrap gap-3 opacity-80">
              {['Intent', 'Fit', 'Context'].map((item) => (
                <div key={item} className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/68">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const LeadsScene = ({ active }: { active: boolean }) => {
  const leads = [
    ["Jordan Park", "Head of Sales · Northline", "High fit"],
    ["Rina Shah", "VP Revenue · SignalFox", "Good fit"],
    ["Alex Müller", "Director of Sales · GraphiteIQ", "Good fit"],
  ];

  return (
    <div className="relative min-h-[440px] md:min-h-[540px] overflow-hidden rounded-[28px] border border-white/10 bg-[#05060a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(137,92,255,0.18),transparent_30%),radial-gradient(circle_at_84%_82%,rgba(255,255,255,0.04),transparent_34%)]" />
      <div className="relative z-10 h-full p-8 md:p-12 flex items-center">
        <div className="w-full grid gap-4">
          {leads.map(([name, meta, fit], index) => (
            <div
              key={name}
              className={`rounded-[26px] border border-white/10 bg-white/[0.04] backdrop-blur-2xl px-6 py-5 flex items-center justify-between gap-4 transition-all duration-800 ${
                active ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-10 scale-[0.985]'
              }`}
              style={{ transitionDelay: `${index * 120}ms` }}
            >
              <div className="min-w-0">
                <p className="text-xl md:text-2xl font-semibold text-white truncate">{name}</p>
                <p className="text-sm md:text-base text-white/52 truncate">{meta}</p>
              </div>
              <span className="rounded-full bg-primary/15 px-3 py-1.5 text-xs md:text-sm font-medium text-primary whitespace-nowrap">
                {fit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const OutreachScene = ({ active }: { active: boolean }) => {
  const lines = [
    "Hey Jordan — noticed Northline is hiring SDRs and growing the sales team in NYC.",
    "That usually means more pressure to build a repeatable prospecting workflow fast.",
    "SalesOS helps teams describe their ICP in plain English, find better-fit leads, and move into outreach faster.",
  ];
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (!active) {
      setVisibleLines(0);
      return;
    }
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setVisibleLines(i);
      if (i >= lines.length) clearInterval(interval);
    }, 220);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className="relative min-h-[440px] md:min-h-[540px] overflow-hidden rounded-[28px] border border-white/10 bg-[#05060a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(137,92,255,0.18),transparent_30%),linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_30%)]" />
      <div className="relative z-10 h-full flex items-center justify-center p-8 md:p-12">
        <div className="w-full max-w-4xl rounded-[30px] border border-white/10 bg-white/[0.04] backdrop-blur-2xl overflow-hidden shadow-[0_0_120px_rgba(120,76,255,0.10)]">
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <p className="text-sm font-medium text-white/88">Outreach draft</p>
              <p className="text-xs text-white/45">Built from lead context</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              <Mail className="w-3.5 h-3.5" />
              Personalized
            </div>
          </div>
          <div className="px-6 py-6 md:px-8 md:py-8">
            <p className="mb-4 text-sm text-white/46">Subject: Quick idea for Northline&apos;s outbound hiring push</p>
            <div className="space-y-4 text-base md:text-lg leading-relaxed text-white/82">
              {lines.map((line, index) => (
                <p
                  key={index}
                  className={`transition-all duration-500 ${visibleLines > index ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
                >
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

const PipelineScene = ({ active }: { active: boolean }) => {
  const bars = [32, 58, 76, 92];
  const labels = ["Contacted", "Qualified", "Proposal", "Closed"];
  const tones = ["from-primary/40 to-primary/72", "from-primary/52 to-primary/82", "from-primary/64 to-accent/72", "from-accent/62 to-white/92"];

  return (
    <div className="relative min-h-[440px] md:min-h-[540px] overflow-hidden rounded-[28px] border border-white/10 bg-[#05060a]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_70%,rgba(137,92,255,0.18),transparent_35%)]" />
      <div className="relative z-10 h-full flex items-center justify-center p-8 md:p-12">
        <div className="w-full max-w-5xl">
          <div className="mb-8 grid grid-cols-2 md:grid-cols-4 gap-3">
            {[["247", "Leads"], ["34", "Meetings"], ["$89K", "Revenue"], ["32%", "Conv. Rate"]].map(([value, label], index) => (
              <div
                key={label}
                className={`rounded-[26px] border border-white/10 bg-white/[0.04] px-5 py-5 text-center transition-all duration-800 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                style={{ transitionDelay: `${index * 120}ms` }}
              >
                <p className="text-2xl md:text-3xl font-semibold text-white">{value}</p>
                <p className="text-sm text-white/46 mt-1">{label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 md:p-8">
            <div className="grid grid-cols-4 gap-3 items-end h-48 md:h-56">
              {bars.map((height, index) => (
                <div key={labels[index]} className="flex flex-col items-center justify-end h-full gap-3">
                  <div className="w-full h-full rounded-[26px] bg-white/[0.03] overflow-hidden border border-white/8 flex items-end">
                    <div
                      className={`w-full rounded-[22px] bg-gradient-to-t ${tones[index]} transition-all duration-1000`}
                      style={{ height: active ? `${height}%` : '6%', transitionDelay: `${index * 130}ms` }}
                    />
                  </div>
                  <span className="text-xs md:text-sm text-white/50">{labels[index]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ClosingScene = ({ active }: { active: boolean }) => (
  <div className="relative min-h-[440px] md:min-h-[540px] overflow-hidden rounded-[28px] border border-white/10 bg-[#04050a]">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(137,92,255,0.3),transparent_38%),radial-gradient(circle_at_center,rgba(255,255,255,0.07),transparent_58%)]" />
    <div className="relative z-10 h-full flex items-center justify-center p-8 md:p-12 text-center">
      <div className={`max-w-3xl transition-all duration-800 ${active ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-[0.985]'}`}>
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          <TrendingUp className="w-3.5 h-3.5" />
          SalesOS
        </div>
        <h3 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[0.95] text-white mb-5">
          Less wasted motion.
          <span className="block bg-gradient-to-r from-primary via-white to-accent bg-clip-text text-transparent">
            More pipeline movement.
          </span>
        </h3>
        <p className="text-lg md:text-xl text-white/56 leading-relaxed mb-8">
          Prospecting, outreach, and pipeline movement in one sharper system.
        </p>
        <a href="/pricing" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-8 py-4 text-base font-semibold text-primary-foreground shadow-[0_0_40px_rgba(120,76,255,0.3)] transition-opacity hover:opacity-90">
          View plans
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  </div>
);

const sceneComponents = [TypeScene, LeadsScene, OutreachScene, PipelineScene, ClosingScene];

export const Demo = () => {
  const [current, setCurrent] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  const sceneDuration = 4200;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setIsVisible(true);
    }, { threshold: 0.2 });

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPlaying || !isVisible) return;

    setProgress(0);
    const start = Date.now();
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min((elapsed / sceneDuration) * 100, 100));
    }, 35);

    const timer = setTimeout(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrent((prev) => (prev + 1) % scenes.length);
        setIsTransitioning(false);
      }, 260);
    }, sceneDuration);

    return () => {
      clearInterval(progressTimer);
      clearTimeout(timer);
    };
  }, [current, isPlaying, isVisible]);

  const SceneComponent = sceneComponents[current];
  const scene = scenes[current];

  const goTo = (index: number) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrent(index);
      setIsTransitioning(false);
    }, 260);
  };

  return (
    <section ref={sectionRef} className="relative py-8 md:py-10 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.018),transparent_55%)]" />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-4 px-1">
          <div>
            <p className="text-[10px] md:text-xs uppercase tracking-[0.24em] text-primary/78 mb-2">{scene.eyebrow}</p>
            <h3 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight text-white">
              {scene.title}
              <span className="block text-white/70">{scene.subtitle}</span>
            </h3>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsPlaying((prev) => !prev)} className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.05] hover:text-white">
            {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
        </div>

        <p className="mb-8 max-w-xl text-sm md:text-base text-white/44 leading-relaxed">{scene.blurb}</p>

        <div className="mb-6 h-[2px] rounded-full bg-white/8 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-primary via-white/70 to-accent transition-all duration-75" style={{ width: `${progress}%` }} />
        </div>

        <div className={`transition-all duration-300 ${isTransitioning ? 'opacity-0 scale-[0.988]' : 'opacity-100 scale-100'}`}>
          <SceneComponent active={isVisible && !isTransitioning} />
        </div>

        <div className="mt-6 grid grid-cols-5 gap-2 md:gap-3">
          {scenes.map((item, index) => (
            <button
              key={item.id}
              onClick={() => goTo(index)}
              className={`rounded-2xl border px-3 py-3 text-left transition-all duration-300 ${
                index === current
                  ? 'border-primary/24 bg-primary/10 shadow-[0_0_25px_rgba(120,76,255,0.16)]'
                  : 'border-white/8 bg-white/[0.025] hover:bg-white/[0.045]'
              }`}
            >
              <p className={`text-[10px] md:text-xs uppercase tracking-[0.18em] ${index === current ? 'text-primary' : 'text-white/28'}`}>
                {item.eyebrow}
              </p>
              <p className={`mt-1 text-xs md:text-sm font-medium leading-snug ${index === current ? 'text-white' : 'text-white/66'}`}>
                {item.title}
              </p>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => goTo((current - 1 + scenes.length) % scenes.length)} className="text-white/62 hover:text-white hover:bg-white/[0.04]">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <div className="inline-flex items-center gap-2 text-xs text-white/34">
            <Users className="w-3.5 h-3.5" />
            SalesOS in motion
          </div>
          <Button variant="ghost" size="sm" onClick={() => goTo((current + 1) % scenes.length)} className="text-white/62 hover:text-white hover:bg-white/[0.04]">
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </section>
  );
};
