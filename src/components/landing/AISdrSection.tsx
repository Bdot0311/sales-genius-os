import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── Simulated agent activity feed ───────────────────────────────────────────

const activityItems = [
  {
    time: "09:14 AM",
    type: "reply",
    prospect: "Jordan Park",
    company: "Northline",
    text: "Replied to interested thread — sent follow-up with demo link",
    color: "hsl(142 70% 50%)",
    dot: "hsl(142 70% 50%)",
  },
  {
    time: "09:22 AM",
    type: "classify",
    prospect: "Rina Shah",
    company: "SignalFox",
    text: "Classified as objection → \"Not the right time\" — response queued",
    color: "hsl(45 90% 60%)",
    dot: "hsl(45 90% 60%)",
  },
  {
    time: "09:31 AM",
    type: "meeting",
    prospect: "Alex Müller",
    company: "GraphiteIQ",
    text: "Meeting requested — sent Calendly link automatically",
    color: "hsl(261 75% 68%)",
    dot: "hsl(261 75% 68%)",
  },
  {
    time: "09:47 AM",
    type: "reply",
    prospect: "Priya Nair",
    company: "VaultHQ",
    text: "Handled objection — replied with ROI framing from your playbook",
    color: "hsl(142 70% 50%)",
    dot: "hsl(142 70% 50%)",
  },
  {
    time: "10:02 AM",
    type: "classify",
    prospect: "Sam Torres",
    company: "OrbitPay",
    text: "Out-of-office detected — flagged for follow-up in 5 days",
    color: "hsl(0 0% 55%)",
    dot: "hsl(0 0% 55%)",
  },
];

const AgentFeedPreview = ({ visible }: { visible: boolean }) => {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!visible) return;
    if (shown >= activityItems.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 300 : 600);
    return () => clearTimeout(t);
  }, [visible, shown]);

  return (
    <div className="w-full h-full flex flex-col p-5 gap-2 overflow-hidden">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-2 rounded-lg mb-1"
        style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.18)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full animate-pulse"
            style={{ background: "hsl(142 70% 50%)" }}
          />
          <span className="text-xs font-semibold" style={{ color: "hsl(261 75% 68%)" }}>
            Agent Active
          </span>
        </div>
        <div className="flex gap-3">
          {[["12", "threads"], ["5", "replied"], ["1", "meeting"]].map(([val, lbl]) => (
            <div key={lbl} className="text-center">
              <p className="text-xs font-bold" style={{ color: "hsl(261 75% 68%)" }}>{val}</p>
              <p className="text-[9px]" style={{ color: "hsl(0 0% 100% / 0.4)" }}>{lbl}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Activity items */}
      <div className="flex flex-col gap-2">
        {activityItems.slice(0, shown).map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
            style={{
              background: "hsl(0 0% 100% / 0.03)",
              border: "1px solid hsl(0 0% 100% / 0.06)",
              animation: "fadeSlideIn 0.4s ease forwards",
            }}
          >
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
              style={{ background: item.dot }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-semibold" style={{ color: "hsl(0 0% 90%)" }}>
                  {item.prospect}
                </span>
                <span className="text-[10px]" style={{ color: "hsl(0 0% 100% / 0.35)" }}>
                  · {item.company}
                </span>
              </div>
              <p className="text-[11px] leading-snug" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
                {item.text}
              </p>
            </div>
            <span
              className="text-[9px] flex-shrink-0 font-mono mt-0.5"
              style={{ color: "hsl(0 0% 100% / 0.25)" }}
            >
              {item.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Feature pills ────────────────────────────────────────────────────────────

const capabilities = [
  {
    icon: "📬",
    title: "Monitors your inbox",
    desc: "Reads every reply from active prospects across Gmail threads, around the clock.",
  },
  {
    icon: "🧠",
    title: "Classifies intent",
    desc: "Interest, objection, meeting request, unsubscribe. Always knows what's what.",
  },
  {
    icon: "✍️",
    title: "Writes & sends replies",
    desc: "Uses your persona, tone, and value props to craft replies that sound like you.",
  },
  {
    icon: "📅",
    title: "Books meetings",
    desc: "Sends your Calendly link the moment a prospect asks for a call.",
  },
  {
    icon: "🛡️",
    title: "Handles objections",
    desc: "Responds to common objections using playbooks you define. No hallucinations, no drift.",
  },
  {
    icon: "⚙️",
    title: "Fully configurable",
    desc: "Set daily reply limits, delay windows, and which actions are fully autonomous.",
  },
];

// ─── Section ──────────────────────────────────────────────────────────────────

export const AISdrSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setIsVisible(true); },
      { threshold: 0.08 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="ai-sdr"
      className="relative py-24 md:py-36 overflow-hidden"
      style={{ background: "hsl(261 75% 1.5%)" }}
      aria-labelledby="ai-sdr-heading"
    >
      {/* Animated background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 55% at 55% 45%, hsl(261 75% 55% / 0.07) 0%, transparent 65%)",
        }}
        aria-hidden="true"
      />
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1200px] mx-auto">

          {/* Two-column: copy left, preview right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

            {/* Left: copy */}
            <div>
              {/* Label */}
              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
                style={{
                  background: "hsl(261 75% 50% / 0.1)",
                  border: "1px solid hsl(261 75% 50% / 0.3)",
                }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "hsl(142 70% 50%)" }}
                />
                <span className="text-xs font-semibold tracking-wide" style={{ color: "hsl(261 75% 70%)" }}>
                  NEW · AI SDR
                </span>
              </div>

              {/* Headline */}
              <h2
                id="ai-sdr-heading"
                className={`mb-5 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{
                  fontSize: "clamp(2.2rem, 4.5vw, 3.5rem)",
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: "-0.02em",
                  color: "hsl(0 0% 96%)",
                  transitionDelay: "80ms",
                }}
              >
                Your AI SDR that
                <br />
                <span
                  className="italic animate-shiny"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                    backgroundSize: "200% auto",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  never sleeps.
                </span>
              </h2>

              {/* Sub-copy */}
              <p
                className={`text-base leading-relaxed mb-8 max-w-[480px] transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ color: "hsl(0 0% 100% / 0.65)", transitionDelay: "160ms" }}
              >
                Connect your Gmail and SalesOS watches every active thread. It classifies replies, handles objections, sends Calendly links when prospects ask for calls, and auto-replies in your voice, on your schedule.
              </p>

              {/* Capability grid */}
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: "240ms" }}
              >
                {capabilities.map((cap) => (
                  <div
                    key={cap.title}
                    className="flex items-start gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "hsl(0 0% 100% / 0.03)", border: "1px solid hsl(261 75% 50% / 0.12)" }}
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">{cap.icon}</span>
                    <div>
                      <p className="text-sm font-semibold mb-0.5" style={{ color: "hsl(0 0% 90%)" }}>
                        {cap.title}
                      </p>
                      <p className="text-xs leading-snug" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
                        {cap.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTAs */}
              <div
                className={`flex items-center gap-4 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
                style={{ transitionDelay: "320ms" }}
              >
                <button
                  onClick={() => navigate("/auth")}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                  style={{
                    background: "linear-gradient(135deg, hsl(261 75% 55%), hsl(280 80% 60%))",
                    color: "hsl(0 0% 98%)",
                    boxShadow: "0 0 24px hsl(261 75% 55% / 0.35)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 0 36px hsl(261 75% 55% / 0.5)")}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "0 0 24px hsl(261 75% 55% / 0.35)")}
                >
                  Activate AI SDR
                </button>
                <button
                  onClick={() => navigate("/pricing")}
                  className="text-sm font-medium transition-colors duration-200"
                  style={{ color: "hsl(261 75% 65%)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "hsl(261 75% 80%)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "hsl(261 75% 65%)")}
                >
                  See pricing →
                </button>
              </div>
            </div>

            {/* Right: agent feed */}
            <div
              className={`transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
              style={{ transitionDelay: "200ms" }}
            >
              <div
                className="rounded-2xl overflow-hidden relative"
                style={{
                  background: "hsl(261 75% 3%)",
                  border: "1px solid hsl(261 75% 50% / 0.22)",
                  boxShadow: "0 0 80px hsl(261 75% 50% / 0.12), 0 32px 80px rgba(0,0,0,0.5)",
                  minHeight: "460px",
                }}
              >
                {/* Window chrome */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.1)", background: "hsl(0 0% 100% / 0.025)" }}
                >
                  <div className="flex items-center gap-2">
                    {["hsl(0 70% 55% / 0.5)", "hsl(45 90% 55% / 0.5)", "hsl(142 60% 50% / 0.5)"].map((bg, i) => (
                      <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: bg }} />
                    ))}
                    <span className="ml-2 text-[11px] font-medium" style={{ color: "hsl(0 0% 100% / 0.2)" }}>
                      SalesOS — AI SDR · Activity Feed
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                    style={{ background: "hsl(142 70% 45% / 0.1)", border: "1px solid hsl(142 70% 45% / 0.2)" }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[10px] font-medium text-green-400">Live</span>
                  </div>
                </div>

                {/* Feed content */}
                <div style={{ minHeight: "400px" }}>
                  <AgentFeedPreview visible={isVisible} />
                </div>

                {/* Bottom glow */}
                <div
                  className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
                  style={{ background: "linear-gradient(to top, hsl(261 75% 50% / 0.06), transparent)" }}
                  aria-hidden="true"
                />
              </div>

              {/* Caption below preview */}
              <p className="text-center text-xs mt-4" style={{ color: "hsl(0 0% 100% / 0.3)" }}>
                Simulated preview — connects to your real Gmail inbox
              </p>
            </div>

          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

      {/* Keyframe for feed item entrance */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
};
