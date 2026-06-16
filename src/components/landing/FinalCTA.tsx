import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

export const FinalCTA = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative py-40 md:py-52 overflow-hidden"
      style={{ background: "hsl(261 75% 2% / 0.82)" }}
      aria-labelledby="final-cta-heading"
    >
      {/* Radial glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, hsl(261 75% 50% / 0.14) 0%, hsl(280 70% 55% / 0.06) 40%, transparent 65%)",
          filter: "blur(60px)",
        }}
        aria-hidden="true"
      />

      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "hsl(261 75% 50% / 0.18)" }}
      />

      <div className="container relative z-10 mx-auto px-6">
        <div className="flex flex-col items-center text-center">

          <motion.p
            className="font-serif italic font-thin text-base text-center text-purple-500 mb-5"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.6, ease }}
          >
            Ready when you are
          </motion.p>

          <h2
            id="final-cta-heading"
            className="font-display mb-6"
            style={{
              fontSize: "clamp(3rem, 8vw, 7rem)",
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              color: "hsl(0 0% 96%)",
            }}
          >
            <motion.span
              className="block"
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.06 }}
            >
              Your next 10 prospects
            </motion.span>
            <motion.span
              className="block italic animate-shiny"
              style={{
                backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: "url(#c3-noise)",
              }}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.18 }}
            >
              in the next 10 minutes.
            </motion.span>
          </h2>

          <motion.p
            className="text-lg font-light max-w-md mx-auto mb-12"
            style={{ color: "hsl(0 0% 100% / 0.7)" }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.55, ease, delay: 0.3 }}
          >
            Verified contacts, ICP scoring, and a personalized first draft. All in one place. Free to start.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.5, ease, delay: 0.42 }}
          >
            <motion.button
              onClick={() => navigate("/auth")}
              className="cta-pill-glow inline-flex items-center gap-2 px-10 rounded-full text-sm font-semibold text-white"
              style={{
                height: "56px",
                background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)",
              }}
              aria-label="Get 10 free leads"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Get 10 free leads
              <ArrowRight className="w-4 h-4" />
            </motion.button>

            <p
              className="mt-4 text-xs"
              style={{ color: "hsl(0 0% 100% / 0.55)" }}
            >
              No credit card required · Cancel anytime · 30-day money-back
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
