import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

export const BigStatSection = () => {
  return (
    <section
      className="relative py-28 md:py-44 overflow-hidden"
      style={{
        background: "hsl(261 75% 2%)",
        borderTop: "1px solid hsl(261 75% 50% / 0.18)",
        borderBottom: "1px solid hsl(261 75% 50% / 0.18)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 55% 60% at 50% 50%, hsl(261 75% 55% / 0.1) 0%, transparent 70%)" }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-6 max-w-3xl relative z-10">
        <div className="flex flex-col items-center text-center">

          <motion.p
            className="font-serif italic font-thin text-base text-center text-purple-500 mb-10"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6, ease }}
          >
            The benchmark
          </motion.p>

          {/* Focal stat — spring entrance */}
          <motion.p
            className="font-display italic leading-none mb-8 animate-shiny"
            style={{
              fontSize: "clamp(5.5rem, 20vw, 14rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "url(#c3-noise)",
            }}
            initial={{ opacity: 0, y: 60, scale: 0.92 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.08 }}
          >
            {"< 2 min"}
          </motion.p>

          <motion.p
            className="text-lg font-light max-w-xs mb-16"
            style={{ color: "hsl(0 0% 100% / 0.7)", lineHeight: 1.6 }}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.55, ease, delay: 0.2 }}
          >
            ICP to sent email. One tool, one workflow.
          </motion.p>

          {/* Supporting stats — staggered */}
          <motion.div
            className="flex flex-col sm:flex-row items-center gap-6 sm:gap-12"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-10% 0px" }}
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.09, delayChildren: 0.28 } },
            }}
          >
            <motion.div
              className="text-center"
              variants={{
                hidden: { opacity: 0, y: 16 },
                show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
              }}
            >
              <span className="block font-display font-bold" style={{ fontSize: "1.75rem", color: "hsl(0 0% 78%)", letterSpacing: "-0.02em" }}>
                10.7%
              </span>
              <span className="block text-xs mt-1" style={{ color: "hsl(0 0% 100% / 0.28)" }}>
                avg reply rate on intent-triggered outreach
              </span>
            </motion.div>

            <div className="hidden sm:block w-px h-12" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

            <motion.div
              className="text-center"
              variants={{
                hidden: { opacity: 0, y: 16 },
                show: { opacity: 1, y: 0, transition: { duration: 0.65, ease } },
              }}
            >
              <span className="block font-display font-bold" style={{ fontSize: "1.75rem", color: "hsl(0 0% 78%)", letterSpacing: "-0.02em" }}>
                1 tool
              </span>
              <span className="block text-xs mt-1" style={{ color: "hsl(0 0% 100% / 0.28)" }}>
                instead of Apollo + Clay + Gmail + spreadsheet
              </span>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  );
};
