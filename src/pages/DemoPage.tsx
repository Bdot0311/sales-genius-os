import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  Search,
  Mail,
  Reply,
  Sparkles,
  Target,
  Inbox,
  TrendingUp,
  Brain,
  Workflow,
  ShieldCheck,
  Clock,
  MessageSquare,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/seo";

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
    from { opacity: 0; transform: translateY(18px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1); }
  }
  @keyframes counter-rise {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes breathe {
    0%,100% { opacity: 0.5; transform: scale(1); }
    50%     { opacity: 1;   transform: scale(1.15); }
  }
  @keyframes chevron-bounce {
    0%,100% { transform: translateY(0); }
    50%     { transform: translateY(6px); }
  }
  @keyframes dot-ring-fill {
    from { stroke-dashoffset: ${2 * Math.PI * 6}; }
    to   { stroke-dashoffset: 0; }
  }
  .animate-breathe { animation: breathe 1.6s ease-in-out infinite; }
  .dissolving-out {
    animation: crossfade-out 0.45s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    will-change: opacity, transform;
  }
  .dissolving-in {
    animation: crossfade-in 0.45s cubic-bezier(0.0, 0, 0.2, 1) forwards;
    will-change: opacity, transform;
  }
  @keyframes crossfade-out {
    0%   { opacity: 1; transform: scale(1) translateY(0); }
    100% { opacity: 0; transform: scale(0.97) translateY(-12px); }
  }
  @keyframes crossfade-in {
    0%   { opacity: 0; transform: scale(1.02) translateY(12px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
`;

const heroSignals = [
  "No boolean gymnastics",
  "Verified contact data",
  "Personalized outreach",
];

const audiencePills = ["Founder-led teams", "Outbound agencies", "B2B sales teams"];

const trustedStats = [
  {
    icon: TrendingUp,
    stat: "Plain English",
    label: "ICP targeting",
    sub: "describe who you want without database gymnastics",
  },
  {
    icon: Clock,
    stat: "Under 2 min",
    label: "To first lead workflow",
    sub: "from idea to matched prospects",
  },
  {
    icon: Mail,
    stat: "One system",
    label: "For search + outreach",
    sub: "less tool-switching across the sales process",
  },
];

const howItWorksSteps = [
  {
    title: "Describe your ideal customer",
    description:
      "Tell SalesOS who you want to reach in plain English: title, industry, company size, geography, or buying signals.",
  },
  {
    title: "Review ranked, enriched matches",
    description:
      "See best-fit prospects first with company context, verified contact data, and scoring that helps you prioritize faster.",
  },
  {
    title: "Launch personalized outreach",
    description:
      "Generate tailored emails, manage replies, and move prospects into your workflow without juggling disconnected tools.",
  },
];

const demoSearchQuery = "Find heads of sales at NYC B2B SaaS companies with 10-100 employees hiring SDRs";

const flowSteps = ["Search faster", "Review better-fit leads", "Launch outreach"];

const demoLeads = [
  {
    name: "Jordan Park",
    title: "Head of Sales",
    company: "Northline",
    fit: "High fit",
    details: "NYC · 45 employees · B2B SaaS · Hiring 2 SDRs",
    email: "jordan@northline.com",
    delay: 0,
  },
  {
    name: "Rina Shah",
    title: "VP Revenue",
    company: "SignalFox",
    fit: "Good fit",
    details: "Brooklyn · 82 employees · PLG SaaS · Expanding outbound",
    email: "rina@signalfox.com",
    delay: 130,
  },
  {
    name: "Alex Müller",
    title: "Director of Sales",
    company: "GraphiteIQ",
    fit: "Good fit",
    details: "Manhattan · 28 employees · B2B SaaS · Recently funded",
    email: "alex@graphiteiq.com",
    delay: 260,
  },
];

const outreachSubject = "Quick idea for Northline's outbound hiring push";
const outreachParagraphs = [
  "Hey Jordan — noticed Northline is hiring SDRs and growing the sales team in NYC.",
  "That usually means more pressure to build a repeatable prospecting workflow fast. SalesOS is designed to help teams describe their ICP in plain English, find better-fit leads, and launch more personalized outreach without spending hours building lists manually.",
  "If helpful, I can show you what that workflow could look like for a team like yours.",
];

const outreachBullets = [
  "Use lead context to make first-touch emails more specific.",
  "Reduce time spent drafting outreach from scratch.",
  "Keep messaging closer to the account, role, and buying signal.",
];

const moduleCards = [
  {
    icon: Target,
    title: "Plain-English ICP Search",
    outcome: "Find the right prospects faster",
    description:
      "Describe your target customer naturally instead of wrestling with filters and boolean logic. SalesOS turns that into a workable lead search flow.",
    gradient: "from-primary/20 to-primary/5",
  },
  {
    icon: Mail,
    title: "Personalized Outreach",
    outcome: "Write smarter first touches",
    description:
      "Use company and contact context to generate more tailored outbound messages, then review and refine before sending.",
    gradient: "from-[hsl(280_75%_60%/0.2)] to-[hsl(280_75%_60%/0.05)]",
  },
  {
    icon: Inbox,
    title: "Reply Management",
    outcome: "Keep momentum after the first email",
    description:
      "Track responses, manage follow-ups, and keep conversations organized so promising leads do not disappear into a messy inbox.",
    gradient: "from-[hsl(200_75%_55%/0.2)] to-[hsl(200_75%_55%/0.05)]",
  },
  {
    icon: TrendingUp,
    title: "Pipeline Visibility",
    outcome: "See what is actually moving",
    description:
      "Understand where deals are progressing, where outreach is stalling, and where your team should focus next.",
    gradient: "from-[hsl(150_60%_50%/0.2)] to-[hsl(150_60%_50%/0.05)]",
  },
];

const supportModules = [
  {
    icon: Workflow,
    label: "Sequences and follow-up logic",
    description:
      "Build repeatable outbound workflows without manually tracking every next step.",
  },
  {
    icon: ShieldCheck,
    label: "Deliverability support",
    description:
      "Monitor key sending health signals so your outreach has a better chance of landing in inboxes.",
  },
  {
    icon: MessageSquare,
    label: "Sales coaching tools",
    description: "Support reps with guidance before and during real conversations.",
  },
  {
    icon: Brain,
    label: "Automation building blocks",
    description:
      "Reduce repetitive sales work with workflow automations that keep the process moving.",
  },
];

const finalTrustSignals = [
  "Setup in 2 min",
  "Plans from $39/month",
];

const useGlobalStyles = () => {
  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = GLOBAL_STYLES;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
};

const Particles = ({ count = 10 }: { count?: number }) => {
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
        key={`${word}-${i}`}
        className="inline-block mr-[0.26em]"
        style={{
          animation: visible
            ? `word-rise 0.4s cubic-bezier(0.22,1,0.36,1) ${baseDelay + i * 34}ms both`
            : "none",
          opacity: visible ? undefined : 0,
        }}
      >
        {gradient ? (
          <span className="bg-gradient-to-r from-primary via-purple-400 to-primary/70 bg-clip-text text-transparent">
            {word}
          </span>
        ) : (
          word
        )}
      </span>
    ))}
  </span>
);

const GlassCard = ({
  children,
  className = "",
  active = false,
}: {
  children: ReactNode;
  className?: string;
  active?: boolean;
}) => (
  <div
    className={`relative rounded-[28px] border border-white/8 bg-[#0c0c1a]/90 overflow-hidden ${className}`}
    style={{
      boxShadow: active
        ? "0 0 45px hsl(261 75% 55% / 0.12), 0 28px 90px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.06)"
        : "0 24px 70px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.04)",
      backgroundImage:
        "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.01))",
      transition: "box-shadow 0.7s ease, transform 0.7s ease",
      transform: active ? "scale(1)" : "scale(0.988)",
    }}
  >
    {active && (
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background:
            "linear-gradient(105deg, transparent 28%, rgba(255,255,255,0.045) 50%, transparent 72%)",
          animation: "shimmer-sweep 1.8s ease-in-out 0.22s 1 both",
        }}
        aria-hidden="true"
      />
    )}
    <div
      className="absolute top-0 left-0 right-0 h-px pointer-events-none"
      style={{
        background:
          "linear-gradient(90deg, transparent, hsl(261 75% 65% / 0.45), transparent)",
      }}
      aria-hidden="true"
    />
    {children}
  </div>
);

const Typewriter = ({ text, active, speed = 16 }: { text: string; active: boolean; speed?: number }) => {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!active) {
      setTyped("");
      return;
    }

    let index = 0;
    let interval: ReturnType<typeof setInterval> | null = null;

    const delay = setTimeout(() => {
      interval = setInterval(() => {
        index += 1;
        setTyped(text.slice(0, index));

        if (index >= text.length && interval) {
          clearInterval(interval);
        }
      }, speed);
    }, 220);

    return () => {
      clearTimeout(delay);
      if (interval) clearInterval(interval);
    };
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
  <div
    className="flex items-center gap-3 mb-7"
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

const IntroChapter = ({ active }: { active: boolean }) => (
  <div className="flex h-full items-center justify-center">
    <div className="relative z-10 text-center px-6 max-w-6xl mx-auto">
      <div
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/22 bg-primary/8 text-xs font-medium text-primary/88 mb-8"
        style={{
          animation: active ? "word-rise 0.7s cubic-bezier(0.22,1,0.36,1) 0.1s both" : "none",
          opacity: active ? undefined : 0,
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-breathe" />
        Product walkthrough
      </div>

      <h1 className="font-black tracking-tight leading-[0.95] mb-6" style={{ fontSize: "clamp(3rem, 8vw, 6.5rem)" }}>
        <div>
          <SplitWords text="Find qualified B2B leads with" visible={active} />
        </div>
        <div>
          <SplitWords text="plain-English search." visible={active} baseDelay={140} gradient />
        </div>
      </h1>

      <p
        className="text-lg md:text-xl text-white/42 max-w-3xl mx-auto leading-relaxed mb-8"
        style={{
          animation: active ? "word-rise 0.8s cubic-bezier(0.22,1,0.36,1) 0.45s both" : "none",
          opacity: active ? undefined : 0,
        }}
      >
        Tell SalesOS who you want to reach. It finds best-fit prospects, enriches them with verified
        contact and company data, and helps you launch personalized outreach in minutes.
      </p>

      <div
        className="flex flex-wrap items-center justify-center gap-3 mb-10"
        style={{
          animation: active ? "word-rise 0.75s cubic-bezier(0.22,1,0.36,1) 0.7s both" : "none",
          opacity: active ? undefined : 0,
        }}
      >
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary">
          <Clock className="w-3 h-3" />
          First qualified lead in under 2 minutes
        </span>
        {heroSignals.map((signal) => (
          <span key={signal} className="text-sm text-white/34">
            {signal}
          </span>
        ))}
      </div>

      <div
        className="flex flex-col items-center gap-2 text-white/30 text-sm mx-auto"
        style={{
          animation: active ? "word-rise 0.7s cubic-bezier(0.22,1,0.36,1) 1s both" : "none",
          opacity: active ? undefined : 0,
        }}
      >
        <span className="text-white/20 text-xs tracking-wide">Auto-playing in a moment…</span>
        <ChevronDown className="w-4 h-4 text-white/20" style={{ animation: "chevron-bounce 1.8s ease-in-out infinite" }} />
      </div>
    </div>
  </div>
);

const SearchChapter = ({ active }: { active: boolean }) => (
  <div className="flex h-full items-center pt-16 md:pt-0">
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-20 items-center">
      <div className="relative">
        <div className="absolute -top-10 -left-2 text-[5rem] md:text-[8.5rem] font-black text-white/[0.018] leading-none select-none pointer-events-none blur-[1px] hidden md:block" aria-hidden="true">
          01
        </div>
        <ChapterLabel num="01" label="Search" visible={active} />
        <h2 className="text-3xl md:text-6xl font-bold tracking-tight text-white leading-[1.05] mb-4 md:mb-6">
          <div>
            <SplitWords text="Describe your ideal" visible={active} />
          </div>
          <div>
            <SplitWords text="customer." visible={active} baseDelay={120} gradient />
          </div>
        </h2>
        <p
          className="text-sm md:text-lg text-white/42 leading-relaxed max-w-md"
          style={{
            animation: active ? "word-rise 0.38s cubic-bezier(0.22,1,0.36,1) 90ms both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          {howItWorksSteps[0].description}
        </p>
      </div>

      <div
        style={{
          animation: active ? "word-rise 0.42s cubic-bezier(0.22,1,0.36,1) 70ms both" : "none",
          opacity: active ? undefined : 0,
        }}
      >
        <GlassCard active={active}>
          {active && (
            <div
              className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent pointer-events-none z-20"
              style={{ animation: "scan-line 2.5s ease-in-out 0.6s 1 both" }}
              aria-hidden="true"
            />
          )}

          <div className="flex items-center gap-2 px-4 md:px-5 py-3 md:py-3.5 border-b border-white/8">
            <Search className="w-4 h-4 text-primary" />
            <span className="text-[11px] text-white/42 font-mono tracking-wider">Search query</span>
            <span className="ml-auto text-[10px] text-primary/55">Plain English</span>
          </div>

          <div className="p-4 md:p-8 space-y-4 md:space-y-5">
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 md:p-5 min-h-[72px] md:min-h-[96px]">
              <div className="text-base md:text-xl font-medium text-white/85 leading-relaxed">
                <Typewriter text={demoSearchQuery} active={active} />
              </div>
            </div>

            <p className="text-xs md:text-sm text-white/40 leading-relaxed">
              Search naturally, narrow the field quickly, and move straight into lead review.
            </p>

            <div className="flex flex-wrap gap-1.5 md:gap-2">
              {["Title", "Industry", "Company size", "Geography", "Buying signal"].map((tag, i) => (
                <span
                  key={tag}
                  className="px-2.5 md:px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-[10px] md:text-xs text-white/40 font-medium"
                  style={{
                    opacity: active ? 1 : 0,
                    transform: active ? "translateY(0) scale(1)" : "translateY(5px) scale(0.96)",
                    transition: `opacity 0.22s ${120 + i * 28}ms, transform 0.22s ${120 + i * 28}ms`,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>

            <div
              className="inline-flex flex-wrap items-center gap-1.5 md:gap-2 text-xs md:text-sm text-primary/85"
              style={{
                opacity: active ? 1 : 0,
                transform: active ? "translateY(0)" : "translateY(5px)",
                transition: "all 0.24s 220ms",
              }}
            >
              {flowSteps.map((step, index) => (
                <span key={step} className="inline-flex items-center gap-1.5 md:gap-2">
                  <span>{step}</span>
                  {index < flowSteps.length - 1 && <ArrowRight className="w-3 h-3 md:w-4 md:h-4 text-primary" />}
                </span>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  </div>
);

const LeadsChapter = ({ active }: { active: boolean }) => (
  <div className="flex h-full items-center pt-16 md:pt-0">
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-16 grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr] gap-4 md:gap-20 items-center">
      <div className="space-y-3 md:space-y-4 order-2 md:order-1">
        {demoLeads.map((lead) => (
          <div
            key={lead.email}
            style={{
              animation: active
                ? `word-rise 0.38s cubic-bezier(0.22,1,0.36,1) ${Math.round(lead.delay * 0.55)}ms both`
                : "none",
              opacity: active ? undefined : 0,
            }}
          >
            <GlassCard active={active} className="p-4 md:p-5">
              <div className="flex items-start justify-between gap-3 md:gap-4">
                <div className="min-w-0">
                  <p className="text-base md:text-xl font-semibold text-white/95">{lead.name}</p>
                  <p className="text-xs md:text-sm text-white/48 mt-0.5">
                    {lead.title} · {lead.company}
                  </p>
                  <p className="text-[10px] md:text-xs text-white/34 mt-1.5 md:mt-2">{lead.details}</p>
                  <div className="mt-2 md:mt-3 inline-flex items-center gap-2 text-[10px] md:text-xs text-white/72">
                    <Mail className="w-3 md:w-3.5 h-3 md:h-3.5 text-primary" />
                    <span>{lead.email}</span>
                  </div>
                </div>
                <span className="rounded-full bg-primary/14 border border-primary/22 text-primary px-2.5 md:px-3 py-1 text-[10px] md:text-xs font-medium whitespace-nowrap">
                  {lead.fit}
                </span>
              </div>
            </GlassCard>
          </div>
        ))}
      </div>

      <div className="relative order-1 md:order-2">
        <div className="absolute -top-10 -right-2 text-[5rem] md:text-[8.5rem] font-black text-white/[0.018] leading-none select-none pointer-events-none text-right blur-[1px] hidden md:block" aria-hidden="true">
          02
        </div>
        <ChapterLabel num="02" label="Leads" visible={active} />
        <h2 className="text-3xl md:text-6xl font-bold tracking-tight text-white leading-[1.05] mb-3 md:mb-6">
          <div>
            <SplitWords text="Review ranked," visible={active} />
          </div>
          <div>
            <SplitWords text="enriched matches." visible={active} baseDelay={120} gradient />
          </div>
        </h2>
        <p
          className="text-sm md:text-lg text-white/42 leading-relaxed max-w-md"
          style={{
            animation: active ? "word-rise 0.36s cubic-bezier(0.22,1,0.36,1) 90ms both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          {howItWorksSteps[1].description}
        </p>
      </div>
    </div>
  </div>
);

const OutreachChapter = ({ active }: { active: boolean }) => {
  const [visibleParagraphs, setVisibleParagraphs] = useState(0);

  useEffect(() => {
    if (!active) {
      setVisibleParagraphs(0);
      return;
    }

    let index = 0;
    const interval = setInterval(() => {
      index += 1;
      setVisibleParagraphs(index);
      if (index >= outreachParagraphs.length) clearInterval(interval);
    }, 220);

    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className="flex h-full items-center pt-16 md:pt-0">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-16 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-20 items-center">
        <div className="relative">
          <div className="absolute -top-10 -left-2 text-[5rem] md:text-[8.5rem] font-black text-white/[0.018] leading-none select-none pointer-events-none blur-[1px] hidden md:block" aria-hidden="true">
            03
          </div>
          <ChapterLabel num="03" label="Outreach" visible={active} />
          <h2 className="text-3xl md:text-6xl font-bold tracking-tight text-white leading-[1.05] mb-4 md:mb-6">
            <div>
              <SplitWords text="Turn lead context" visible={active} />
            </div>
            <div>
              <SplitWords text="into outreach." visible={active} baseDelay={120} gradient />
            </div>
          </h2>
          <p
            className="text-sm md:text-lg text-white/42 leading-relaxed max-w-md"
            style={{
              animation: active ? "word-rise 0.42s cubic-bezier(0.22,1,0.36,1) 110ms both" : "none",
              opacity: active ? undefined : 0,
            }}
          >
            Generate more relevant outbound from the lead and company details already inside SalesOS.
          </p>

          <GlassCard active={active} className="mt-4 md:mt-6 p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4 text-sm font-medium text-white/82">
              <Sparkles className="w-4 h-4 text-primary" />
              Built for outbound teams
            </div>
            <ul className="space-y-3 text-sm text-white/48 leading-relaxed">
              {outreachBullets.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/8 p-4">
              <p className="text-xs font-medium text-primary mb-1">SalesOS output</p>
              <p className="text-sm text-white/46 leading-relaxed">
                Outreach drafts are generated from the same lead context your team is already reviewing.
              </p>
            </div>
          </GlassCard>
        </div>

        <div
          style={{
            animation: active ? "word-rise 0.4s cubic-bezier(0.22,1,0.36,1) 60ms both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          <GlassCard active={active}>
            <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white/82">Sample outreach draft</div>
                <div className="text-xs text-white/32 mt-0.5">Built from lead context</div>
              </div>
              <span className="rounded-full bg-primary/12 border border-primary/20 text-primary/85 px-3 py-1 text-xs font-medium">
                Personalized
              </span>
            </div>

            <div className="px-5 py-5">
              <div className="text-xs text-white/28 mb-4">Subject: {outreachSubject}</div>
              <div className="space-y-4 text-sm md:text-base leading-relaxed text-white/72">
                {outreachParagraphs.map((paragraph, index) => (
                  <p
                    key={paragraph}
                    style={{
                      opacity: visibleParagraphs > index ? 1 : 0,
                      transform: visibleParagraphs > index ? "translateY(0)" : "translateY(5px)",
                      transition: "opacity 0.22s ease, transform 0.22s ease",
                    }}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>

              <div className="mt-5 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <Reply className="w-4 h-4 text-primary mt-0.5" />
                <p className="text-sm text-white/46 leading-relaxed">
                  Review the draft, refine the message, and move into live outreach with less manual setup.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

const PlatformChapter = ({ active }: { active: boolean }) => (
  <div className="flex h-full items-center pt-16 md:pt-0">
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-16">
      <div className="text-center mb-6 md:mb-10 relative">
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-[5rem] md:text-[8.5rem] font-black text-white/[0.018] leading-none select-none pointer-events-none blur-[1px] hidden md:block" aria-hidden="true">
          04
        </div>
        <div className="flex justify-center">
          <ChapterLabel num="04" label="Platform" visible={active} />
        </div>
        <h2 className="text-3xl md:text-6xl font-bold tracking-tight text-white leading-[1.05] mb-3 md:mb-4">
          <div>
            <SplitWords text="From first lead" visible={active} />
          </div>
          <div>
            <SplitWords text="to closed deal — in one place." visible={active} baseDelay={110} gradient />
          </div>
        </h2>
        <p
          className="text-sm md:text-lg text-white/42 leading-relaxed max-w-3xl mx-auto"
          style={{
            animation: active ? "word-rise 0.42s cubic-bezier(0.22,1,0.36,1) 120ms both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          The core workflow: find the right leads, reach out with quality-checked emails, manage every
          reply, and track what&apos;s closing.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-5">
        {moduleCards.map((module, index) => (
          <div
            key={module.title}
            style={{
              animation: active
                ? `word-rise 0.38s cubic-bezier(0.22,1,0.36,1) ${index * 70}ms both`
                : "none",
              opacity: active ? undefined : 0,
            }}
          >
            <GlassCard active={active} className="p-4 md:p-5 h-full">
              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br ${module.gradient} flex items-center justify-center mb-3 md:mb-4`}>
                <module.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-base md:text-lg font-semibold text-white/92 mb-1">{module.title}</h3>
              <p className="text-sm text-primary/80 font-medium mb-2">{module.outcome}</p>
              <p className="text-sm text-white/46 leading-relaxed">{module.description}</p>
            </GlassCard>
          </div>
        ))}
      </div>

      <GlassCard active={active} className="p-4 md:p-5 hidden md:block">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/32 mb-3 md:mb-4">Also included</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {supportModules.map((item, index) => (
            <div
              key={item.label}
              className="flex gap-3"
              style={{
                animation: active
                  ? `word-rise 0.3s cubic-bezier(0.22,1,0.36,1) ${180 + index * 40}ms both`
                  : "none",
                opacity: active ? undefined : 0,
              }}
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center mt-0.5">
                <item.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/82 leading-snug mb-1">{item.label}</p>
                <p className="text-xs text-white/40 leading-relaxed">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  </div>
);

const SignalsChapter = ({ active }: { active: boolean }) => (
  <div className="flex h-full items-center justify-center pt-16 md:pt-0">
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6">
      <div className="text-center mb-6 md:mb-10 relative">
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-[5rem] md:text-[8.5rem] font-black text-white/[0.018] leading-none select-none pointer-events-none blur-[1px] hidden md:block" aria-hidden="true">
          05
        </div>
        <div className="flex justify-center">
          <ChapterLabel num="05" label="Signals" visible={active} />
        </div>
        <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white leading-[1.05] mb-4">
          <div>
            <SplitWords text="Built for founder-led" visible={active} />
          </div>
          <div>
            <SplitWords text="sales and outbound teams." visible={active} baseDelay={120} gradient />
          </div>
        </h2>
        <p
          className="text-base md:text-lg text-white/42 leading-relaxed max-w-2xl mx-auto"
          style={{
            animation: active ? "word-rise 0.42s cubic-bezier(0.22,1,0.36,1) 120ms both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          For teams that want better-fit leads, faster prospecting, and a simpler outbound workflow.
        </p>
      </div>

      <div
        className="flex flex-wrap items-center justify-center gap-2 mb-6"
        style={{
          animation: active ? "word-rise 0.38s cubic-bezier(0.22,1,0.36,1) 180ms both" : "none",
          opacity: active ? undefined : 0,
        }}
      >
        {audiencePills.map((pill) => (
          <span
            key={pill}
            className="inline-flex items-center px-4 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-sm font-medium text-white/60"
          >
            {pill}
          </span>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {trustedStats.map((stat, index) => (
          <div
            key={stat.label}
            style={{
              animation: active
                ? `counter-rise 0.45s cubic-bezier(0.22,1,0.36,1) ${index * 80}ms both`
                : "none",
              opacity: active ? undefined : 0,
            }}
          >
            <GlassCard active={active} className="px-6 py-7 text-center h-full">
              <stat.icon className="w-4 h-4 text-primary/60 mb-3 mx-auto" />
              <div className="text-3xl md:text-4xl font-black tracking-tight bg-gradient-to-r from-primary via-purple-400 to-primary/70 bg-clip-text text-transparent">
                {stat.stat}
              </div>
              <div className="text-sm font-semibold text-white/72 mt-2">{stat.label}</div>
              <div className="text-xs text-white/38 mt-1 leading-relaxed">{stat.sub}</div>
            </GlassCard>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const CTAChapter = ({ active, navigate }: { active: boolean; navigate: (path: string) => void }) => (
  <div className="flex h-full items-center justify-center">
    <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/8 text-xs font-medium text-primary mb-6"
        style={{
          animation: active ? "word-rise 0.4s cubic-bezier(0.22,1,0.36,1) both" : "none",
          opacity: active ? undefined : 0,
        }}
      >
        <Sparkles className="w-3.5 h-3.5" />
        Final step
      </div>

      <h2 className="text-4xl md:text-6xl font-black tracking-tight text-white mb-5 leading-tight">
        <div>
          <SplitWords text="Ready to find your next" visible={active} />
        </div>
        <div
          className="bg-gradient-to-r from-primary via-purple-400 to-primary/70 bg-clip-text text-transparent"
          style={{
            animation: active ? "word-rise 0.45s cubic-bezier(0.22,1,0.36,1) 110ms both" : "none",
            opacity: active ? undefined : 0,
          }}
        >
          best-fit lead?
        </div>
      </h2>

      <p
        className="text-lg text-white/38 mb-8 max-w-2xl mx-auto leading-relaxed"
        style={{
          animation: active ? "word-rise 0.45s cubic-bezier(0.22,1,0.36,1) 180ms both" : "none",
          opacity: active ? undefined : 0,
        }}
      >
        Describe your ideal customer, review matched prospects, and choose the SalesOS plan that fits
        your outbound workflow.
      </p>


      <div
        style={{
          animation: active ? "word-rise 0.5s cubic-bezier(0.22,1,0.36,1) 320ms both" : "none",
          opacity: active ? undefined : 0,
        }}
      >
        <Button
          size="lg"
          className="group text-base h-14 px-8 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => navigate("/auth")}
        >
          View plans and get started
          <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-0.5 transition-transform" />
        </Button>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-white/48">
          {finalTrustSignals.map((signal, index) => (
            <span key={signal} className="inline-flex items-center gap-4">
              <span>{signal}</span>
              {index < finalTrustSignals.length - 1 && <span className="w-1 h-1 rounded-full bg-white/15" />}
            </span>
          ))}
        </div>

        <p className="mt-5 text-xs text-white/28 max-w-sm mx-auto leading-relaxed">
          Preview the workflow, then choose the plan that matches your prospecting volume and team
          needs.
        </p>
      </div>
    </div>
  </div>
);

const SECTIONS = [
  { id: "hero", label: "Intro" },
  { id: "search", label: "Search" },
  { id: "leads", label: "Leads" },
  { id: "outreach", label: "Outreach" },
  { id: "platform", label: "Platform" },
  { id: "signals", label: "Signals" },
  { id: "cta", label: "Get Started" },
];

export default function DemoPage() {
  useGlobalStyles();

  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [previousSection, setPreviousSection] = useState<number | null>(null);
  const lockRef = useRef(false);
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalSections = SECTIONS.length;
  const transitioning = previousSection !== null;
  const [autoplaying, setAutoplaying] = useState(true);
  const DURATIONS = [2600, 5400, 5200, 5600, 6200, 5200, 7000];

  const goTo = useCallback(
    (index: number) => {
      if (lockRef.current || index === current || index < 0 || index >= totalSections) return;

      lockRef.current = true;
      setPreviousSection(current);
      setCurrent(index);

      setTimeout(() => {
        setPreviousSection(null);
        lockRef.current = false;
      }, 500);
    },
    [current, totalSections]
  );

  const next = useCallback(() => goTo(current + 1), [goTo, current]);
  const prev = useCallback(() => goTo(current - 1), [goTo, current]);

  useEffect(() => {
    if (!autoplaying || transitioning) return;

    const duration = DURATIONS[current] || 5000;
    autoTimerRef.current = setTimeout(() => {
      if (current < totalSections - 1) {
        next();
      } else {
        setAutoplaying(false);
      }
    }, duration);

    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [autoplaying, current, next, totalSections, transitioning]);

  const manualGoTo = useCallback(
    (index: number) => {
      setAutoplaying(false);
      goTo(index);
    },
    [goTo]
  );

  const manualNext = useCallback(() => {
    setAutoplaying(false);
    next();
  }, [next]);

  const manualPrev = useCallback(() => {
    setAutoplaying(false);
    prev();
  }, [prev]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === " ") {
        event.preventDefault();
        manualNext();
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        manualPrev();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [manualNext, manualPrev]);

  useEffect(() => {
    let accumulated = 0;
    const threshold = 80;
    let lastTime = 0;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = Date.now();

      if (now - lastTime > 300) accumulated = 0;
      lastTime = now;
      accumulated += event.deltaY;

      if (Math.abs(accumulated) >= threshold) {
        if (accumulated > 0) manualNext();
        else manualPrev();
        accumulated = 0;
      }
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [manualNext, manualPrev]);

  useEffect(() => {
    let startY = 0;

    const onStart = (event: TouchEvent) => {
      startY = event.touches[0].clientY;
    };

    const onEnd = (event: TouchEvent) => {
      const diff = startY - event.changedTouches[0].clientY;
      if (Math.abs(diff) > 50) {
        if (diff > 0) manualNext();
        else manualPrev();
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [manualNext, manualPrev]);

  const isActive = (index: number) => current === index;
  const glowPositions = ["50% 44%", "18% 50%", "82% 50%", "22% 50%", "50% 28%", "50% 50%", "50% 50%"];

  return (
    <div className="bg-[#080810] text-white overflow-hidden" style={{ height: "100dvh" }}>
      <SEOHead
        title="See SalesOS in Action | Product Demo"
        description="Watch how SalesOS takes you from ICP to personalized outreach in minutes."
      />
      <Navbar />

      <div className="fixed inset-0 pointer-events-none z-0">
        <Particles count={10} />
        <div
          className="absolute inset-0 transition-all duration-[1200ms] ease-in-out"
          style={{
            background: `radial-gradient(circle at ${glowPositions[current]}, hsl(261 75% 50% / 0.13), transparent 54%)`,
          }}
          aria-hidden="true"
        />
      </div>

      <div className="fixed inset-0 z-10">
        {SECTIONS.map((section, index) => {
          const isCurrent = current === index;
          const isLeaving = previousSection === index;
          const isVisible = isCurrent || isLeaving;

          if (!isVisible) {
            return <div key={section.id} className="absolute inset-0" style={{ opacity: 0, pointerEvents: "none" }} />;
          }

          return (
            <div
              key={section.id}
              className={`absolute inset-0 ${isLeaving ? "dissolving-out" : ""} ${isCurrent && transitioning ? "dissolving-in" : ""}`}
              style={{
                opacity: isCurrent && !transitioning ? 1 : undefined,
                pointerEvents: isCurrent && !transitioning ? "auto" : "none",
                zIndex: isCurrent ? 2 : 1,
              }}
            >
              {section.id === "hero" && <IntroChapter active={isActive(index)} />}
              {section.id === "search" && <SearchChapter active={isActive(index)} />}
              {section.id === "leads" && <LeadsChapter active={isActive(index)} />}
              {section.id === "outreach" && <OutreachChapter active={isActive(index)} />}
              {section.id === "platform" && <PlatformChapter active={isActive(index)} />}
              {section.id === "signals" && <SignalsChapter active={isActive(index)} />}
              {section.id === "cta" && <CTAChapter active={isActive(index)} navigate={navigate} />}
            </div>
          );
        })}
      </div>

      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-3">
        {SECTIONS.map((section, index) => (
          <button
            key={section.id}
            onClick={() => manualGoTo(index)}
            className="group relative flex items-center"
            aria-label={`Go to ${section.label}`}
          >
            <span className="absolute right-6 px-2.5 py-1 rounded-md bg-[#1a1a2e]/90 text-[10px] text-white/70 font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {section.label}
            </span>
            <div className="relative w-4 h-4 flex items-center justify-center">
              {current === index && autoplaying && (
                <svg className="absolute inset-0 w-4 h-4 -rotate-90" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="6" fill="none" stroke="hsl(261 75% 65% / 0.3)" strokeWidth="1.5" />
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    fill="none"
                    stroke="hsl(261, 75%, 65%)"
                    strokeWidth="1.5"
                    strokeDasharray={`${2 * Math.PI * 6}`}
                    strokeDashoffset="0"
                    strokeLinecap="round"
                    style={{ animation: `dot-ring-fill ${(DURATIONS[current] || 5000)}ms linear forwards` }}
                  />
                </svg>
              )}
              <div
                className="w-2 h-2 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: current === index ? "hsl(261, 75%, 65%)" : "rgba(255,255,255,0.15)",
                  transform: current === index ? "scale(1.4)" : "scale(1)",
                  boxShadow: current === index ? "0 0 12px hsl(261 75% 65% / 0.5)" : "none",
                }}
              />
            </div>
          </button>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-30 h-[2px] bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-primary via-purple-400 to-primary/70 transition-all duration-600 ease-out"
          style={{ width: `${((current + 1) / totalSections) * 100}%` }}
        />
      </div>

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 text-[10px] text-white/15 select-none">
        <span className="px-1.5 py-0.5 border border-white/10 rounded text-[9px]">←</span>
        <span className="px-1.5 py-0.5 border border-white/10 rounded text-[9px]">→</span>
        <span>or scroll</span>
      </div>
    </div>
  );
}
