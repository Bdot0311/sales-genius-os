import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── Preview panels — one per module ─────────────────────────────────────────

const LeadDiscoveryPreview = () => (
  <div className="w-full h-full flex flex-col gap-3 p-6">
    {/* Search bar */}
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{ background: "hsl(261 75% 50% / 0.1)", border: "1px solid hsl(261 75% 50% / 0.25)" }}
    >
      <span className="text-xs" style={{ color: "hsl(261 75% 50% / 0.6)" }}>›</span>
      <span className="text-sm" style={{ color: "hsl(261 75% 72%)" }}>
        VP Sales at Series B SaaS, NYC, hiring SDRs
      </span>
    </div>
    {/* Stat row */}
    <div className="flex gap-2">
      {[["847", "matches"], ["94%", "verified"], ["< 2 min", "to results"]].map(([val, lbl]) => (
        <div
          key={lbl}
          className="flex-1 rounded-lg p-3 text-center"
          style={{ background: "hsl(0 0% 100% / 0.04)", border: "1px solid hsl(0 0% 100% / 0.07)" }}
        >
          <p className="text-base font-bold" style={{ color: "hsl(261 75% 68%)" }}>{val}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "hsl(0 0% 100% / 0.35)" }}>{lbl}</p>
        </div>
      ))}
    </div>
    {/* Lead rows */}
    {[
      { name: "Jordan Park",  role: "Head of Sales · Northline",  fit: 94 },
      { name: "Rina Shah",    role: "VP Revenue · SignalFox",      fit: 88 },
      { name: "Alex Müller",  role: "Dir. Sales · GraphiteIQ",    fit: 81 },
    ].map(({ name, role, fit }, i) => (
      <div
        key={name}
        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
        style={{ background: "hsl(0 0% 100% / 0.03)", border: "1px solid hsl(0 0% 100% / 0.07)" }}
      >
        <div>
          <p className="text-sm font-medium" style={{ color: "hsl(0 0% 88%)" }}>{name}</p>
          <p className="text-[11px] mt-0.5" style={{ color: "hsl(0 0% 100% / 0.35)" }}>{role}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="h-1 w-12 rounded-full overflow-hidden" style={{ background: "hsl(0 0% 100% / 0.08)" }}>
            <div className="h-full rounded-full" style={{ width: `${fit}%`, background: "linear-gradient(to right, hsl(261 75% 55%), hsl(280 80% 65%))" }} />
          </div>
          <span className="text-xs font-semibold" style={{ color: "hsl(261 75% 68%)" }}>{fit}%</span>
        </div>
      </div>
    ))}
  </div>
);

const OutreachPreview = () => (
  <div className="w-full h-full flex flex-col gap-3 p-6">
    {/* Email card */}
    <div className="rounded-xl overflow-hidden flex-1 flex flex-col" style={{ background: "hsl(0 0% 100% / 0.03)", border: "1px solid hsl(261 75% 50% / 0.2)" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.12)" }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "hsl(261 75% 60%)" }} />
          <span className="text-xs font-medium" style={{ color: "hsl(261 75% 65%)" }}>AI Draft — Jordan Park</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "hsl(142 70% 45% / 0.15)", color: "hsl(142 70% 60%)", border: "1px solid hsl(142 70% 45% / 0.25)" }}>
          Quality check passed
        </span>
      </div>
      <div className="px-4 py-4 flex-1 space-y-3">
        <p className="text-[11px]" style={{ color: "hsl(0 0% 100% / 0.3)" }}>
          Subject: Quick idea for Northline's outbound push
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
          Hey Jordan — saw Northline is scaling the sales team in NYC. That usually means more pressure to build pipeline fast.
        </p>
        <p className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
          SalesOS helps teams like yours find better-fit leads and move into outreach in one session — no list building, no copy-paste.
        </p>
      </div>
      {/* Quality bar */}
      <div className="px-4 pb-4 flex gap-2">
        {["Personalized", "Not too long", "Clear CTA"].map((tag) => (
          <span
            key={tag}
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: "hsl(261 75% 50% / 0.1)", color: "hsl(261 75% 65%)", border: "1px solid hsl(261 75% 50% / 0.2)" }}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  </div>
);

const ReplyPreview = () => (
  <div className="w-full h-full flex flex-col gap-3 p-6">
    {/* Thread list */}
    {[
      { name: "Jordan Park",  last: "Thanks — can we talk Thursday?",     badge: "Reply",    badgeColor: "hsl(142 70% 50%)" },
      { name: "Rina Shah",    last: "Interested, send me a demo link",      badge: "Hot",      badgeColor: "hsl(22 90% 60%)"  },
      { name: "Alex Müller",  last: "Not right now, maybe Q3",              badge: "Follow up", badgeColor: "hsl(261 75% 60%)" },
      { name: "Priya Nair",   last: "Who are you? (sent your follow-up)",   badge: "Opened",   badgeColor: "hsl(0 0% 50%)"    },
    ].map(({ name, last, badge, badgeColor }, i) => (
      <div
        key={name}
        className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ background: i === 0 ? "hsl(261 75% 50% / 0.08)" : "hsl(0 0% 100% / 0.03)", border: `1px solid ${i === 0 ? "hsl(261 75% 50% / 0.2)" : "hsl(0 0% 100% / 0.07)"}` }}
      >
        <div
          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold"
          style={{ background: "hsl(261 75% 50% / 0.15)", color: "hsl(261 75% 65%)" }}
        >
          {name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: "hsl(0 0% 88%)" }}>{name}</p>
          <p className="text-xs truncate mt-0.5" style={{ color: "hsl(0 0% 100% / 0.35)" }}>{last}</p>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
          style={{ background: `${badgeColor}18`, color: badgeColor, border: `1px solid ${badgeColor}30` }}
        >
          {badge}
        </span>
      </div>
    ))}
  </div>
);

const PipelinePreview = () => {
  const stages = [
    { label: "Contacted",  count: 124, pct: 100 },
    { label: "Replied",    count:  52, pct:  42 },
    { label: "Qualified",  count:  28, pct:  23 },
    { label: "Closed",     count:  11, pct:   9 },
  ];
  return (
    <div className="w-full h-full flex flex-col gap-4 p-6">
      {/* Funnel bars */}
      {stages.map(({ label, count, pct }) => (
        <div key={label}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: "hsl(0 0% 70%)" }}>{label}</span>
            <span className="text-xs font-semibold" style={{ color: "hsl(261 75% 65%)" }}>{count}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "hsl(0 0% 100% / 0.06)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: "linear-gradient(to right, hsl(261 75% 55%), hsl(280 80% 65%))",
                opacity: 0.4 + (pct / 100) * 0.6,
              }}
            />
          </div>
        </div>
      ))}
      {/* Metric row */}
      <div className="flex gap-3 mt-2">
        {[["32%", "Reply rate"], ["$89K", "Pipeline"], ["11", "Closed"]].map(([val, lbl]) => (
          <div
            key={lbl}
            className="flex-1 rounded-xl p-3"
            style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.18)" }}
          >
            <p className="text-base font-bold" style={{ color: "hsl(261 75% 68%)" }}>{val}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "hsl(0 0% 100% / 0.35)" }}>{lbl}</p>
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
    tagline: "ICP to ranked prospects in under 2 minutes.",
    description: "Describe who you want in plain English. Get back verified contacts ranked by fit — no filters, no boolean, no list-building.",
  },
  {
    number: "02",
    title: "Outreach Studio",
    tagline: "Context-aware email drafts you actually want to send.",
    description: "Each email is built from real company context — news, growth signals, open roles. Quality-checked before you hit send.",
  },
  {
    number: "03",
    title: "Reply Management",
    tagline: "Inbox zero for your email pipeline.",
    description: "Every response tracked. Follow-up sequences that keep momentum. No prospect slips through because you forgot to check.",
  },
  {
    number: "04",
    title: "Pipeline & Analytics",
    tagline: "See what's moving. Know what to push.",
    description: "Understand where email threads are progressing, where outreach stalls, and what to prioritize next — not 40-tab dashboards.",
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
      (entries) => { if (entries[0].isIntersecting) setIsVisible(true); },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  const Preview = previews[activeIndex];

  return (
    <section
      ref={sectionRef}
      id="features"
      className="relative py-24 md:py-36 overflow-hidden"
      style={{ background: "hsl(261 75% 2%)" }}
      aria-labelledby="modules-heading"
    >
      {/* Purple centre glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 70% 50% at 50% 50%, hsl(261 75% 55% / 0.06) 0%, transparent 65%)" }}
        aria-hidden="true"
      />
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1200px] mx-auto">

          {/* Header */}
          <div
            className={`mb-16 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
          >
            <p className="font-serif italic font-thin text-base text-center text-purple-500 mb-5">
              The Platform
            </p>
            <h2
              id="modules-heading"
              className="font-display text-center text-5xl"
              style={{ fontSize: "clamp(2.4rem, 5vw, 4rem)", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em", color: "hsl(0 0% 96%)" }}
            >
              Everything you need
              <br />
              <span
                className="italic animate-shiny"
                style={{
                  backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "url(#c3-noise)",
                }}
              >
                to run outbound.
              </span>
            </h2>
          </div>

          {/* 2-column layout: module list + live preview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-start">

            {/* Left: module rows */}
            <div className="flex flex-col">
              {modules.map((mod, index) => {
                const isActive = activeIndex === index;
                return (
                  <div
                    key={mod.number}
                    className={`group relative cursor-pointer transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                    style={{ transitionDelay: `${index * 80}ms` }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => setActiveIndex(index)}
                  >
                    <div
                      className="h-px transition-all duration-300"
                      style={{
                        background: isActive
                          ? "linear-gradient(to right, hsl(261 75% 55% / 0.7), transparent)"
                          : "hsl(261 75% 50% / 0.12)",
                      }}
                    />

                    <div className={`flex gap-5 py-6 pr-4 transition-all duration-300 rounded-r-xl ${isActive ? "pl-4" : "pl-0"}`}
                      style={{ background: isActive ? "hsl(261 75% 50% / 0.05)" : "transparent" }}
                    >
                      {/* Number */}
                      <span
                        className="font-mono text-xs flex-shrink-0 w-8 pt-0.5 transition-colors duration-200"
                        style={{ color: isActive ? "hsl(261 75% 65%)" : "hsl(261 75% 50% / 0.4)" }}
                      >
                        {mod.number}
                      </span>

                      <div className="flex-1">
                        <h3
                          className="text-lg font-semibold mb-1 transition-colors duration-200 leading-snug"
                          style={{ color: isActive ? "hsl(0 0% 98%)" : "hsl(0 0% 72%)" }}
                        >
                          {mod.title}
                        </h3>
                        <p className="text-sm mb-2" style={{ color: "hsl(261 75% 65% / 0.75)" }}>
                          {mod.tagline}
                        </p>
                        {/* Description only expands when active */}
                        <div
                          className="overflow-hidden transition-all duration-500"
                          style={{ maxHeight: isActive ? "80px" : "0px", opacity: isActive ? 1 : 0 }}
                        >
                          <p className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
                            {mod.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="h-px" style={{ background: "hsl(261 75% 50% / 0.12)" }} />

              {/* Also included */}
              <div
                className={`mt-10 transition-all duration-700 ${isVisible ? "opacity-100" : "opacity-0"}`}
                style={{ transitionDelay: "400ms" }}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] mb-3" style={{ color: "hsl(261 75% 55% / 0.5)" }}>
                  Also included
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {alsoIncluded.map((item) => (
                    <span key={item} className="text-xs" style={{ color: "hsl(0 0% 100% / 0.32)" }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="mt-8">
                <button
                  onClick={() => navigate("/pricing")}
                  className="text-sm font-medium transition-colors duration-200"
                  style={{ color: "hsl(261 75% 65%)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(261 75% 80%)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(261 75% 65%)")}
                >
                  See plans and pricing →
                </button>
              </div>
            </div>

            {/* Right: live preview panel */}
            <div
              className={`hidden lg:block sticky top-24 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
              style={{ transitionDelay: "200ms" }}
            >
              <div
                className="rounded-2xl overflow-hidden relative"
                style={{
                  background: "hsl(261 75% 3%)",
                  border: "1px solid hsl(261 75% 50% / 0.2)",
                  boxShadow: "0 0 60px hsl(261 75% 50% / 0.1), 0 24px 60px rgba(0,0,0,0.4)",
                  minHeight: "400px",
                }}
              >
                {/* Fake window chrome */}
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.1)", background: "hsl(0 0% 100% / 0.02)" }}
                >
                  {["hsl(0 70% 55% / 0.5)", "hsl(45 90% 55% / 0.5)", "hsl(142 60% 50% / 0.5)"].map((bg, i) => (
                    <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: bg }} />
                  ))}
                  <span className="ml-3 text-[11px] font-medium" style={{ color: "hsl(0 0% 100% / 0.2)" }}>
                    SalesOS — {modules[activeIndex].title}
                  </span>
                </div>

                {/* Preview content — crossfades */}
                <div className="relative" style={{ minHeight: "360px" }}>
                  {previews.map((P, i) => (
                    <div
                      key={i}
                      className="absolute inset-0 transition-opacity duration-400"
                      style={{ opacity: activeIndex === i ? 1 : 0, pointerEvents: activeIndex === i ? "auto" : "none" }}
                    >
                      <P />
                    </div>
                  ))}
                </div>

                {/* Purple glow reflection at bottom */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none"
                  style={{ background: "linear-gradient(to top, hsl(261 75% 50% / 0.06), transparent)" }}
                  aria-hidden="true"
                />
              </div>
            </div>

          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />
    </section>
  );
};
