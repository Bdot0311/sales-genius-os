import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

export const BigStatSection = () => {
  return (
    <section
      className="relative py-28 md:py-44 overflow-hidden"
      style={{
        background: "hsl(0,0%,3%)",
        borderTop: "1px solid hsl(261 75% 50% / 0.18)",
        borderBottom: "1px solid hsl(261 75% 50% / 0.18)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 60% at 50% 50%, hsl(261 75% 55% / 0.1) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-6 max-w-3xl relative z-10">
        <div className="flex flex-col items-center text-center">

          <motion.p
            className="text-[10px] uppercase tracking-[0.28em] mb-10 font-medium"
            style={{ color: "hsl(261 75% 55% / 0.6)" }}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6, ease }}
          >
            The benchmark
          </motion.p>

          <motion.p
            className="font-display italic leading-none mb-8"
            style={{
              fontSize: "clamp(5.5rem, 20vw, 14rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "hsl(261 75% 65%)",
            }}
            initial={{ opacity: 0, scale: 0.82, y: 24 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 1, ease, delay: 0.08 }}
          >
            {"< 2 min"}
          </motion.p>

          <motion.p
            className="text-lg font-light max-w-xs mb-16"
            style={{ color: "hsl(0 0% 100% / 0.4)", lineHeight: 1.6 }}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.7, ease, delay: 0.18 }}
          >
            From ICP to first email sent. No tab-switching.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center gap-6 sm:gap-12"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.7, ease, delay: 0.3 }}
          >
            <div className="text-center">
              <span
                className="block font-display font-bold"
                style={{ fontSize: "1.75rem", color: "hsl(0 0% 78%)", letterSpacing: "-0.02em" }}
              >
                10.7%
              </span>
              <span className="block text-xs mt-1" style={{ color: "hsl(0 0% 100% / 0.28)" }}>
                reply rate on signal sequences
              </span>
            </div>

            <div className="hidden sm:block w-px h-12" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

            <div className="text-center">
              <span
                className="block font-display font-bold"
                style={{ fontSize: "1.75rem", color: "hsl(0 0% 78%)", letterSpacing: "-0.02em" }}
              >
                1 tool
              </span>
              <span className="block text-xs mt-1" style={{ color: "hsl(0 0% 100% / 0.28)" }}>
                instead of Apollo + Clay + Gmail + spreadsheet
              </span>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};
