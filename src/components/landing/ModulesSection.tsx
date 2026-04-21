import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

// ─── Warm-dark palette shared with dashboard mockup ──────────────────────────
const CORAL = "hsl(14 59% 62%)";
const CORAL_SOFT = "hsl(14 59% 62% / 0.14)";
const TEXT_HI = "hsl(34 30% 92%)";
const TEXT_MID = "hsl(30 10% 72%)";
const TEXT_LO = "hsl(30 8% 48%)";
const SURFACE = "hsl(28 8% 13%)";
const SURFACE_2 = "hsl(28 8% 16%)";
const LINE = "hsl(28 10% 22%)";

// ─── Preview panels — one per module ─────────────────────────────────────────

const LeadDiscoveryPreview = () => (
  <div className="flex h-full w-full flex-col gap-3 p-6">
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: SURFACE_2, border: `1px solid ${LINE}` }}
    >
      <span className="font-mono text-xs" style={{ color: CORAL }}>&gt;</span>
      <span className="text-sm" style={{ color: TEXT_HI }}>
        VP Sales at Series B SaaS, NYC, hiring SDRs
      </span>
    </div>
    <div className="flex gap-2">
      {[["847", "matches"], ["94%", "verified"], ["< 2m", "to results"]].map(([val, lbl]) => (
        <div
          key={lbl}
          className="flex-1 rounded-lg p-3 text-center"
          style={{ background: SURFACE_2, border: `1px solid ${LINE}` }}
        >
          <p className="font-display text-lg" style={{ color: TEXT_HI, fontWeight: 400 }}>
            {val}
          </p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider" style={{ color: TEXT_LO }}>
            {lbl}
          </p>
        </div>
      ))}
    </div>
    {[
      { name: "Jordan Park", role: "Head of Sales · Northline", fit: 94 },
      { name: "Rina Shah", role: "VP Revenue · SignalFox", fit: 88 },
      { name: "Alex Müller", role: "Dir. Sales · GraphiteIQ", fit: 81 },
    ].map(({ name, role, fit }) => (
      <div
        key={name}
        className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
        style={{ background: SURFACE_2, border: `1px solid ${LINE}` }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: TEXT_HI }}>{name}</p>
          <p className="mt-0.5 text-[11px]" style={{ color: TEXT_MID }}>{role}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <div className="h-1 w-12 overflow-hidden rounded-full" style={{ background: "hsl(28 10% 22%)" }}>
            <div className="h-full rounded-full" style={{ width: `${fit}%`, background: CORAL }} />
          </div>
          <span className="font-mono text-xs font-medium tabular-nums" style={{ color: CORAL }}>
            {fit}%
          </span>
        </div>
      </div>
    ))}
  </div>
);

const OutreachPreview = () => (
  <div className="flex h-full w-full flex-col gap-3 p-6">
    <div
      className="flex flex-1 flex-col overflow-hidden rounded-xl"
      style={{ background: SURFACE_2, border: `1px solid ${LINE}` }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: `1px solid ${LINE}` }}
      >
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full" style={{ background: CORAL }} />
          <span className="eyebrow" style={{ color: CORAL }}>AI draft — J. Park</span>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ background: "hsl(142 30% 20%)", color: "hsl(142 45% 62%)", border: "1px solid hsl(142 30% 28%)" }}
        >
          Quality check
        </span>
      </div>
      <div className="flex-1 space-y-3 px-4 py-4">
        <p className="font-mono text-[11px]" style={{ color: TEXT_LO }}>
          Subject: Quick idea for Northline's outbound push
        </p>
        <p className="text-sm leading-relaxed" style={{ color: TEXT_HI }}>
          Hey Jordan — saw Northline is scaling the sales team in NYC. That
          usually means more pressure to build pipeline fast.
        </p>
        <p className="text-sm leading-relaxed" style={{ color: TEXT_MID }}>
          SalesOS helps teams like yours find better-fit leads and move into
          outreach in one session — no list building, no copy-paste.
        </p>
      </div>
      <div className="flex gap-2 px-4 pb-4">
        {["Personalized", "Not too long", "Clear CTA"].map((tag) => (
          <span
            key={tag}
            className="rounded-full px-2 py-0.5 font-mono text-[10px]"
            style={{ background: CORAL_SOFT, color: CORAL, border: `1px solid hsl(14 59% 62% / 0.3)` }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  </div>
);

const ReplyPreview = () => (
  <div className="flex h-full w-full flex-col gap-3 p-6">
    {[
      { name: "Jordan Park", last: "Thanks — can we talk Thursday?", badge: "Reply", hue: "hsl(142 45% 52%)" },
      { name: "Rina Shah", last: "Interested, send me a demo link", badge: "Hot", hue: "hsl(22 80% 62%)" },
      { name: "Alex Müller", last: "Not right now, maybe Q3", badge: "Follow up", hue: CORAL },
      { name: "Priya Nair", last: "Who are you? (sent your follow-up)", badge: "Opened", hue: "hsl(28 10% 60%)" },
    ].map(({ name, last, badge, hue }, i) => (
      <div
        key={name}
        className="flex items-center gap-3 rounded-xl px-4 py-3"
        style={{
          background: i === 0 ? CORAL_SOFT : SURFACE_2,
          border: `1px solid ${i === 0 ? "hsl(14 59% 62% / 0.3)" : LINE}`,
        }}
      >
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          style={{ background: CORAL_SOFT, color: CORAL }}
        >
          {name[0]}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium" style={{ color: TEXT_HI }}>{name}</p>
          <p className="mt-0.5 truncate text-xs" style={{ color: TEXT_MID }}>{last}</p>
        </div>
        <span
          className="flex-shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium"
          style={{
            background: `${hue.replace("hsl(", "hsl(").replace(")", " / 0.18)")}`,
            color: hue,
            border: `1px solid ${hue.replace(")", " / 0.35)")}`,
          }}
        >
          {badge}
        </span>
      </div>
    ))}
  </div>
);

const PipelinePreview = () => {
  const stages = [
    { label: "Contacted", count: 124, pct: 100 },
    { label: "Replied", count: 52, pct: 42 },
    { label: "Qualified", count: 28, pct: 23 },
    { label: "Closed", count: 11, pct: 9 },
  ];
  return (
    <div className="flex h-full w-full flex-col gap-4 p-6">
      {stages.map(({ label, count, pct }) => (
        <div key={label}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: TEXT_HI }}>{label}</span>
            <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: CORAL }}>
              {count}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: "hsl(28 10% 20%)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: CORAL,
                opacity: 0.4 + (pct / 100) * 0.6,
              }}
            />
          </div>
        </div>
      ))}
      <div className="mt-2 flex gap-3">
        {[["32%", "Reply rate"], ["$89K", "Pipeline"], ["11", "Closed"]].map(([val, lbl]) => (
          <div
            key={lbl}
            className="flex-1 rounded-xl p-3"
            style={{ background: SURFACE_2, border: `1px solid ${LINE}` }}
          >
            <p className="font-display text-lg" style={{ color: TEXT_HI, fontWeight: 400 }}>
              {val}
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider" style={{ color: TEXT_LO }}>
              {lbl}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

const previews = [LeadDiscoveryPreview, OutreachPreview, ReplyPreview, PipelinePreview];

// ─── Module rows ──────────────────────────────────────────────────────────────

const modules = [
  {
    number: "01",
    title: "Lead Discovery",
    tagline: "ICP to ranked prospects in under two minutes.",
    description:
      "Describe who you want in plain English. Get back verified contacts ranked by fit — no filters, no boolean, no list-building.",
  },
  {
    number: "02",
    title: "Outreach Studio",
    tagline: "Context-aware drafts you actually want to send.",
    description:
      "Each email is built from real company context — news, growth signals, open roles. Quality-checked before you hit send.",
  },
  {
    number: "03",
    title: "Reply Management",
    tagline: "Inbox zero for your email pipeline.",
    description:
      "Every response tracked. Follow-up sequences that keep momentum. No prospect slips through because you forgot to check.",
  },
  {
    number: "04",
    title: "Pipeline & Analytics",
    tagline: "See what's moving. Know what to push.",
    description:
      "Understand where email threads are progressing, where outreach stalls, and what to prioritize — not forty-tab dashboards.",
  },
];

const alsoIncluded = [
  "Multi-step sequences",
  "Deliverability monitoring",
  "Sales coaching tools",
  "Zapier & API automation",
  "White-label client portal",
  "Agency reporting",
];

// ─── Section ──────────────────────────────────────────────────────────────────

export const ModulesSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="features"
      className="relative overflow-hidden py-24 sm:py-36"
      style={{ background: "hsl(34 33% 96%)" }}
      aria-labelledby="modules-heading"
    >
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative z-10 mx-auto max-w-[1120px] px-6 sm:px-8">
        {/* Header */}
        <div
          className={`mb-16 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
          }`}
        >
          <div className="mb-6 flex items-center gap-3">
            <span className="eyebrow">03 / Platform</span>
            <span className="hairline w-12" />
            <span className="eyebrow-muted">Everything in one place</span>
          </div>
          <h2
            id="modules-heading"
            className="font-display max-w-3xl"
            style={{
              fontSize: "clamp(2.2rem, 5vw, 3.75rem)",
              fontWeight: 400,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
              color: "hsl(28 10% 14%)",
            }}
          >
            Everything you need{" "}
            <span className="italic" style={{ color: "hsl(14 59% 52%)", fontWeight: 500 }}>
              to run outbound.
            </span>
          </h2>
        </div>

        {/* 2-column layout */}
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left: module rows */}
          <div className="flex flex-col">
            {modules.map((mod, index) => {
              const isActive = activeIndex === index;
              return (
                <button
                  type="button"
                  key={mod.number}
                  className={`group relative cursor-pointer text-left transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                  }`}
                  style={{ transitionDelay: `${index * 80}ms` }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onClick={() => setActiveIndex(index)}
                  aria-pressed={isActive}
                  aria-label={`Preview ${mod.title}`}
                >
                  <div
                    className="h-px"
                    style={{
                      background: isActive
                        ? "linear-gradient(to right, hsl(14 59% 59%), transparent)"
                        : "hsl(28 10% 88%)",
                      transition: "background 0.3s ease",
                    }}
                  />

                  <div className="flex gap-6 py-7">
                    <span
                      className="mt-1 w-10 flex-shrink-0 font-mono text-xs tabular-nums transition-colors duration-200"
                      style={{
                        color: isActive ? "hsl(14 59% 52%)" : "hsl(28 6% 52%)",
                      }}
                    >
                      {mod.number}
                    </span>

                    <div className="flex-1">
                      <h3
                        className="font-display mb-1 transition-colors duration-200"
                        style={{
                          fontSize: "1.35rem",
                          fontWeight: 400,
                          letterSpacing: "-0.015em",
                          color: "hsl(28 10% 14%)",
                        }}
                      >
                        {mod.title}
                      </h3>
                      <p
                        className="text-[15px]"
                        style={{
                          color: isActive ? "hsl(14 59% 52%)" : "hsl(28 6% 38%)",
                          transition: "color 0.2s ease",
                        }}
                      >
                        {mod.tagline}
                      </p>
                      <div
                        className="overflow-hidden transition-all duration-500"
                        style={{ maxHeight: isActive ? "120px" : "0px", opacity: isActive ? 1 : 0 }}
                      >
                        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "hsl(28 6% 38%)" }}>
                          {mod.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            <div className="hairline" />

            {/* Also included */}
            <div
              className={`mt-12 transition-all duration-700 ${
                isVisible ? "opacity-100" : "opacity-0"
              }`}
              style={{ transitionDelay: "400ms" }}
            >
              <p className="eyebrow-muted mb-4">Also included</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {alsoIncluded.map((item) => (
                  <span
                    key={item}
                    className="text-sm"
                    style={{ color: "hsl(28 6% 38%)" }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="mt-10">
              <button
                onClick={() => navigate("/pricing")}
                className="cta-ghost inline-flex items-center gap-1.5 text-[15px] font-medium"
              >
                See plans and pricing
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Right: warm-dark preview */}
          <div
            className={`hidden lg:block sticky top-24 transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
            style={{ transitionDelay: "200ms" }}
          >
            {/* Soft coral shadow */}
            <div
              className="pointer-events-none absolute -bottom-6 left-6 right-6 h-20 rounded-[100%] blur-2xl"
              style={{ background: "hsl(14 75% 70% / 0.3)" }}
              aria-hidden="true"
            />

            <div
              className="relative overflow-hidden rounded-[20px]"
              style={{
                background: SURFACE,
                border: `1px solid ${LINE}`,
                boxShadow:
                  "0 1px 0 hsl(34 33% 100% / 0.05) inset, 0 24px 60px -24px hsl(28 10% 10% / 0.35)",
                minHeight: "460px",
              }}
            >
              {/* Window chrome */}
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: `1px solid ${LINE}`, background: SURFACE_2 }}
              >
                {["hsl(4 60% 55% / 0.55)", "hsl(40 80% 55% / 0.55)", "hsl(142 40% 50% / 0.55)"].map((bg, i) => (
                  <div key={i} className="h-2.5 w-2.5 rounded-full" style={{ background: bg }} />
                ))}
                <span
                  className="ml-3 font-mono text-[11px] font-medium"
                  style={{ color: TEXT_MID }}
                >
                  SalesOS — {modules[activeIndex].title}
                </span>
              </div>

              <div className="relative" style={{ minHeight: "400px" }}>
                {previews.map((P, i) => (
                  <div
                    key={i}
                    className="absolute inset-0 transition-opacity duration-500"
                    style={{
                      opacity: activeIndex === i ? 1 : 0,
                      pointerEvents: activeIndex === i ? "auto" : "none",
                    }}
                  >
                    <P />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 hairline" />
    </section>
  );
};
