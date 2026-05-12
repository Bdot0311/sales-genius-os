import { motion } from "motion/react";

const lines = [
  { text: "You spend Monday building a list.", color: "hsl(0 0% 90%)" },
  { text: "Tuesday writing emails.", color: "hsl(0 0% 65%)" },
  { text: "Wednesday realizing half are wrong-fit.", color: "hsl(261 75% 68%)" },
];

const ease = [0.16, 1, 0.3, 1] as const;

export const ProblemSection = () => {
  return (
    <section
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ background: "hsl(0,0%,3%)" }}
      aria-labelledby="problem-heading"
    >
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

      <div
        className="absolute top-0 left-0 w-[500px] h-[500px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at top left, hsl(261 75% 55% / 0.08) 0%, transparent 65%)" }}
        aria-hidden="true"
      />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">

          <motion.p
            className="text-[10px] uppercase tracking-[0.28em] mb-10 font-medium"
            style={{ color: "hsl(261 75% 60%)" }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6, ease }}
          >
            The Problem
          </motion.p>

          <h2 id="problem-heading" className="space-y-1 mb-12">
            {lines.map((line, index) => (
              <motion.span
                key={index}
                className="block font-display"
                style={{
                  fontSize: "clamp(2rem, 5vw, 3.8rem)",
                  fontWeight: 800,
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                  color: line.color,
                }}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{
                  duration: index === 0 ? 0.8 : index === 1 ? 0.7 : 0.65,
                  ease,
                  delay: index * 0.11,
                }}
              >
                {line.text}
              </motion.span>
            ))}
          </h2>

          <motion.p
            className="text-base font-light max-w-xl mx-auto leading-relaxed"
            style={{ color: "hsl(0 0% 100% / 0.38)" }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.55, ease, delay: 0.38 }}
          >
            The average outbound team burns 40% of their week on research before
            a single email goes out. SalesOS takes that from 2+ hours to under
            20 minutes — with every contact verified before it reaches you.
          </motion.p>

          <motion.div
            className="mt-16 h-px mx-auto max-w-xs"
            style={{
              background: "linear-gradient(to right, transparent, hsl(261 75% 50% / 0.3), transparent)",
            }}
            initial={{ opacity: 0, scaleX: 0 }}
            whileInView={{ opacity: 1, scaleX: 1 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.7, ease, delay: 0.5 }}
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "hsl(261 75% 50% / 0.18)" }} />
    </section>
  );
};
