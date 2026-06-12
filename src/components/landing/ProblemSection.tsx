import { motion } from "motion/react";

const lines: Array<{
  text: string;
  color?: string;
  gradient?: boolean;
  italic?: boolean;
}> = [
  { text: "Export 500 contacts from Apollo.", color: "hsl(0 0% 90%)" },
  { text: "Score them. Draft emails one by one.", color: "hsl(0 0% 65%)" },
  { text: "Send 50. Get 3 replies. Start over.", gradient: true, italic: true },
];

const ease = [0.16, 1, 0.3, 1] as const;

export const ProblemSection = () => {
  return (
    <section
      className="relative py-24 md:py-32 overflow-hidden"
      style={{ background: "hsl(261 75% 2% / 0.82)" }}
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
            className="font-serif italic font-thin text-base text-center text-purple-500 mb-10"
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
                className={`block font-display${line.italic ? " italic" : ""}${line.gradient ? " animate-shiny" : ""}`}
                style={{
                  fontSize: "clamp(2rem, 5vw, 3.8rem)",
                  fontWeight: 800,
                  lineHeight: 1.1,
                  letterSpacing: "-0.02em",
                  ...(line.gradient
                    ? {
                        backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                        backgroundSize: "200% auto",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        filter: "url(#c3-noise)",
                      }
                    : { color: line.color }),
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
            style={{ color: "hsl(0 0% 100% / 0.7)" }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.55, ease, delay: 0.38 }}
          >
            Most outbound teams spend more time building lists than running calls.
            OutReign cuts the research from 2+ hours to under 20 minutes, with every
            contact verified before it ever reaches your queue.
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
