import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

const steps = [
  {
    number: "01",
    title: "Describe your customer once.",
    body: "Type who you want in plain English — title, industry, company size, location, hiring signals. No filters. No boolean. Just intent.",
    visual: (
      <div
        className="mt-5 rounded-md px-4 py-3 font-mono text-sm leading-relaxed"
        style={{
          background: "hsl(261 75% 50% / 0.08)",
          border: "1px solid hsl(261 75% 50% / 0.2)",
          color: "hsl(261 75% 72%)",
        }}
      >
        <span style={{ color: "hsl(261 75% 50% / 0.5)" }} className="mr-2 select-none">{">"}</span>
        "VP of Sales at Series B SaaS companies in the US, 50–200 employees, actively hiring SDRs"
      </div>
    ),
  },
  {
    number: "02",
    title: "Review who's actually worth emailing.",
    body: "Your prospects come back ranked by ICP fit with verified business emails. You see match score, company context, and open job signals — before you write a single word.",
    visual: (
      <div
        className="mt-5 rounded-xl overflow-hidden"
        style={{ background: "hsl(261 75% 50% / 0.05)", border: "1px solid hsl(261 75% 50% / 0.18)" }}
      >
        {[
          { name: "Jordan Park", role: "Head of Sales · Northline", fit: 94 },
          { name: "Rina Shah", role: "VP Revenue · SignalFox", fit: 88 },
          { name: "Alex Müller", role: "Dir. of Sales · GraphiteIQ", fit: 81 },
        ].map(({ name, role, fit }, i) => (
          <div
            key={name}
            className="flex items-center justify-between gap-4 px-4 py-3"
            style={{ borderBottom: i < 2 ? "1px solid hsl(261 75% 50% / 0.1)" : undefined }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: "hsl(0 0% 88%)" }}>{name}</p>
              <p className="text-xs mt-0.5" style={{ color: "hsl(0 0% 100% / 0.35)" }}>{role}</p>
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <div className="h-1 w-14 rounded-full overflow-hidden" style={{ background: "hsl(0 0% 100% / 0.08)" }}>
                <div className="h-full rounded-full" style={{ width: `${fit}%`, background: "linear-gradient(to right, hsl(261 75% 55%), hsl(280 80% 65%))" }} />
              </div>
              <span className="text-xs font-semibold" style={{ color: "hsl(261 75% 68%)" }}>{fit}%</span>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-1.5 px-4 py-2.5" style={{ borderTop: "1px solid hsl(261 75% 50% / 0.1)" }}>
          <span style={{ color: "hsl(261 75% 62%)", fontSize: "10px" }}>✓</span>
          <span className="text-[10px]" style={{ color: "hsl(0 0% 100% / 0.22)" }}>
            Business emails verified via SMTP + multi-source enrichment
          </span>
        </div>
      </div>
    ),
  },
  {
    number: "03",
    title: "Send something worth reading.",
    body: "SalesOS drafts a first-touch email from the prospect's actual context — company news, role, growth signals. Edit it in 30 seconds and ship.",
    visual: (
      <div
        className="mt-5 rounded-xl overflow-hidden"
        style={{ background: "hsl(261 75% 50% / 0.05)", border: "1px solid hsl(261 75% 50% / 0.18)" }}
      >
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.1)" }}>
          <span className="text-xs font-medium" style={{ color: "hsl(261 75% 60%)" }}>AI Draft</span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: "hsl(261 75% 50% / 0.15)", border: "1px solid hsl(261 75% 50% / 0.25)", color: "hsl(261 75% 72%)" }}
          >
            Quality check passed
          </span>
        </div>
        <div className="px-4 py-3 space-y-1.5">
          <p className="text-[11px]" style={{ color: "hsl(0 0% 100% / 0.3)" }}>
            Subject: Quick idea for Northline's outbound push
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            Hey Jordan — saw Northline is scaling the sales team in NYC and hiring SDRs right now. That usually means more pressure to build pipeline fast…
          </p>
        </div>
      </div>
    ),
  },
];

export const HowItWorks = () => {
  const navigate = useNavigate();

  return (
    <section
      id="how-it-works"
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ background: "hsl(0,0%,3%)" }}
      aria-labelledby="how-it-works-heading"
    >
      <div
        className="absolute top-1/2 right-0 -translate-y-1/2 w-[500px] h-[600px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at right, hsl(261 75% 55% / 0.07) 0%, transparent 65%)" }}
        aria-hidden="true"
      />
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[720px] mx-auto text-center">

          <motion.p
            className="text-[10px] uppercase tracking-[0.28em] mb-6 font-medium text-center text-purple-500"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6, ease }}
          >
            How it works
          </motion.p>

          <motion.h2
            id="how-it-works-heading"
            className="font-display mb-16"
            style={{
              fontSize: "clamp(2.4rem, 5vw, 3.8rem)",
              fontWeight: 800,
              lineHeight: 1.06,
              letterSpacing: "-0.02em",
              color: "hsl(0 0% 95%)",
            }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.08 }}
          >
            Three steps.
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 80% 68%) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              One workflow.
            </span>
          </motion.h2>

          <div className="flex flex-col">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                className="relative border-b py-10"
                style={{ borderColor: "hsl(261 75% 50% / 0.12)" }}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{
                  duration: index === 0 ? 0.7 : index === 1 ? 0.65 : 0.6,
                  ease,
                  delay: index * 0.06,
                }}
              >
                <span
                  className="absolute top-4 right-0 text-8xl font-bold leading-none select-none pointer-events-none"
                  style={{ color: "hsl(261 75% 50% / 0.06)" }}
                  aria-hidden="true"
                >
                  {step.number}
                </span>

                <div className="relative text-center">
                  <p className="font-mono text-xs tracking-widest mb-3 uppercase" style={{ color: "hsl(261 75% 60%)" }}>
                    {step.number}
                  </p>
                  <h3 className="text-2xl font-semibold mb-3 leading-snug" style={{ color: "hsl(0 0% 90%)" }}>
                    {step.title}
                  </h3>
                  <p className="leading-relaxed max-w-lg mx-auto" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
                    {step.body}
                  </p>
                  {step.visual}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="pt-10"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <motion.button
              onClick={() => navigate("/auth")}
              className="text-sm font-medium inline-flex items-center gap-1.5"
              style={{ color: "hsl(261 75% 65%)" }}
              whileHover={{ x: 3, color: "hsl(261 75% 80%)" }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              Try it with your own ICP →
            </motion.button>
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />
    </section>
  );
};
