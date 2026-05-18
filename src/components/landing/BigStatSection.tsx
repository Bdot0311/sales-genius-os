<<<<<<< HEAD
import { useEffect, useRef, useState } from "react";

// Stats are product-design facts, not fabricated customer benchmarks.
// Update with real data as you collect it.

export const BigStatSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { threshold: 0.25 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const stats = [
    {
      display: "< 2 min",
      label: "From ICP description to ranked lead list",
      sub: "No boolean search. No list-building.",
    },
    {
      display: "1 tool",
      label: "Search → enrich → draft → send",
      sub: "Stop switching between Apollo, Clay, and Gmail",
    },
    {
      display: "$0",
      label: "To start — free plan, no credit card",
      sub: "Upgrade only when it's clearly worth it",
    },
  ];

  return (
    <section
      ref={ref}
      className="relative py-20 md:py-28 overflow-hidden"
=======
import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

export const BigStatSection = () => {
  return (
    <section
      className="relative py-28 md:py-44 overflow-hidden"
>>>>>>> origin/main
      style={{
        background: "hsl(0,0%,3%)",
        borderTop: "1px solid hsl(261 75% 50% / 0.18)",
        borderBottom: "1px solid hsl(261 75% 50% / 0.18)",
      }}
<<<<<<< HEAD
      aria-label="Key metrics"
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, hsl(261 75% 55% / 0.09) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-6 max-w-5xl relative z-10">
        <p
          className={`text-center text-[10px] font-medium uppercase tracking-[0.28em] mb-12 transition-all duration-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
          style={{ color: "hsl(261 75% 60%)" }}
        >
          The workflow
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="flex flex-col items-center md:items-start text-center md:text-left px-8 py-6 transition-all duration-700"
              style={{
                borderRight: i < 2 ? "1px solid hsl(261 75% 50% / 0.12)" : undefined,
                transitionDelay: `${i * 120}ms`,
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(16px)",
              }}
            >
              <span
                className="font-display block mb-2"
                style={{
                  fontSize: "clamp(2.8rem, 5vw, 4.5rem)",
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  background: "linear-gradient(135deg, hsl(261 75% 78%) 0%, hsl(280 80% 70%) 60%, hsl(261 75% 62%) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {stat.display}
              </span>
              <span className="block text-sm font-semibold mb-1" style={{ color: "hsl(0 0% 80%)" }}>
                {stat.label}
              </span>
              <span className="block text-xs" style={{ color: "hsl(261 75% 60% / 0.55)" }}>
                {stat.sub}
              </span>
            </div>
          ))}
=======
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
            className="font-display italic leading-none mb-8"
            style={{
              fontSize: "clamp(5.5rem, 20vw, 14rem)",
              fontWeight: 800,
              letterSpacing: "-0.03em",
              color: "hsl(261 75% 65%)",
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
            style={{ color: "hsl(0 0% 100% / 0.4)", lineHeight: 1.6 }}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.55, ease, delay: 0.2 }}
          >
            From ICP to first email sent. No tab-switching.
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
                reply rate on signal sequences
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

>>>>>>> origin/main
        </div>
      </div>
    </section>
  );
};
