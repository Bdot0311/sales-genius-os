import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

const rows = [
  {
    legacy: "1,000 raw contacts and a spreadsheet",
    truth: "Ranked prospects scored by ICP fit",
  },
  {
    legacy: "Boolean search that takes 45 minutes to configure",
    truth: "Plain English. Leads in under 2 minutes.",
  },
  {
    legacy: "A data tool that stops at the export",
    truth: "From search to sent email in one workflow",
  },
  {
    legacy: "$500/mo for data you still have to manually qualify",
    truth: "Scoring, enrichment, and outreach included",
  },
];

export const DifferentiationSection = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ background: "hsl(261 75% 2%)" }}
      aria-labelledby="differentiation-heading"
    >
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

      <div
        className="absolute top-1/2 right-0 -translate-y-1/2 w-[450px] h-[550px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at right, hsl(261 75% 55% / 0.08) 0%, transparent 65%)" }}
        aria-hidden="true"
      />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-3xl mx-auto">

          <motion.p
            className="font-serif italic font-thin text-base text-center text-purple-500 mb-5"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6, ease }}
          >
            The difference
          </motion.p>

          <motion.h2
            id="differentiation-heading"
            className="font-display mb-14"
            style={{
              fontSize: "clamp(2.4rem, 5vw, 4rem)",
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              color: "hsl(0 0% 95%)",
            }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.08 }}
          >
            Apollo sells you contacts.
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
              We show you who to email next.
            </span>
          </motion.h2>

          {/* Rows — staggered */}
          <motion.div
            className="flex flex-col"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-10% 0px" }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
            }}
          >
            {rows.map((row, index) => (
              <motion.div
                key={index}
                className="flex items-center gap-6 py-5 border-b"
                style={{ borderColor: "hsl(261 75% 50% / 0.14)" }}
                variants={{
                  hidden: { opacity: 0, y: 16 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease } },
                }}
              >
                <span className="flex-1 text-sm line-through leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.22)" }}>
                  {row.legacy}
                </span>

                <ArrowRight
                  className="flex-shrink-0 w-4 h-4"
                  style={{ color: "hsl(261 75% 50% / 0.5)" }}
                  aria-hidden="true"
                />

                <span
                  className="flex-1 text-sm font-medium leading-relaxed"
                  style={{ color: "hsl(261 75% 72%)" }}
                >
                  {row.truth}
                </span>
              </motion.div>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            className="mt-12 flex flex-col items-start gap-3"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.55, ease, delay: 0.38 }}
          >
            <motion.button
              onClick={() => navigate("/auth")}
              className="inline-flex items-center gap-1.5 text-sm font-medium group"
              style={{ color: "hsl(261 75% 65%)" }}
              whileHover={{ x: 3, color: "hsl(261 75% 80%)" }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            >
              Start free, no card needed
              <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </motion.button>
            <p className="text-xs" style={{ color: "hsl(0 0% 100% / 0.25)" }}>
              Free plan available · Cancel anytime
            </p>
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />
    </section>
  );
};
