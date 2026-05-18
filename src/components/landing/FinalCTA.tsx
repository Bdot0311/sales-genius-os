<<<<<<< HEAD
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const FinalCTA = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id="final-cta"
      className="relative py-28 md:py-40 overflow-hidden"
      aria-labelledby="final-cta-heading"
    >
      {/* Dramatic background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[700px] aurora-ambient"
          style={{
            background: 'radial-gradient(ellipse at center, hsl(261 75% 50% / 0.15) 0%, hsl(280 70% 45% / 0.08) 30%, transparent 60%)',
          }}
          aria-hidden="true"
        />
        {/* Secondary glow */}
        <div 
          className="absolute top-1/3 left-1/4 w-[500px] h-[500px] animate-glow-pulse"
          style={{
            background: 'radial-gradient(circle, hsl(280 75% 55% / 0.08) 0%, transparent 60%)',
          }}
          aria-hidden="true"
        />
        <div 
          className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] animate-glow-pulse"
          style={{
            background: 'radial-gradient(circle, hsl(261 75% 55% / 0.06) 0%, transparent 60%)',
            animationDelay: '1.5s',
          }}
          aria-hidden="true"
        />
      </div>
      
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      
      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className={`max-w-3xl mx-auto text-center scroll-reveal ${isVisible ? 'visible' : ''}`}>
            {/* Animated border card */}
            <div className="animated-border pulse-glow">
              <div className="relative p-12 md:p-16 rounded-2xl bg-gradient-to-b from-card/95 via-card/90 to-card/80 overflow-hidden">
                {/* Inner glow */}
                <div 
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'radial-gradient(ellipse at 50% 0%, hsl(261 75% 65% / 0.08) 0%, transparent 50%)',
                  }}
                  aria-hidden="true"
                />
                
                {/* Sparkle icon */}
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-6 transition-all duration-700 delay-100 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                  <Sparkles className="w-7 h-7 text-primary" aria-hidden="true" />
                </div>
                
                <div className="relative z-10">
                  <h2 id="final-cta-heading" className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-5">
                    Ready to close{" "}
                    <span className="text-shimmer">more deals</span>?
                  </h2>
                  
                  <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-lg mx-auto leading-relaxed">
                    SalesOS is free to explore. Create your account, see the platform in action, and upgrade when you're ready.
                  </p>

                  {/* CTA with glow */}
                  <Button
                    size="lg"
                    className="h-16 px-10 text-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl group shadow-[0_0_30px_hsl(261_75%_65%/0.3)] hover:shadow-[0_0_50px_hsl(261_75%_65%/0.45)] hover:-translate-y-1 transition-all duration-300"
                    onClick={() => navigate('/auth')}
                    aria-label="Start for free — no credit card required"
                  >
                    <span>Start for free</span>
                    <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1.5 transition-transform duration-200" aria-hidden="true" />
                  </Button>

                  {/* Trust signals */}
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground/60">
                    <span>No credit card required</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span>Free forever plan</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span>Setup in 2 min</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
=======
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";

const ease = [0.16, 1, 0.3, 1] as const;

export const FinalCTA = () => {
  const navigate = useNavigate();

  return (
    <section
      className="relative py-40 md:py-52 overflow-hidden"
      style={{ background: "hsl(0,0%,3%)" }}
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
            Your next pipeline starts here
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
              Stop researching.
            </motion.span>
            <motion.span
              className="block italic"
              style={{
                background: "linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 80% 68%) 50%, hsl(261 75% 60%) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{ type: "spring", stiffness: 60, damping: 18, delay: 0.18 }}
            >
              Start conversations.
            </motion.span>
          </h2>

          <motion.p
            className="text-lg font-light max-w-md mx-auto mb-12"
            style={{ color: "hsl(0 0% 100% / 0.35)" }}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10% 0px" }}
            transition={{ duration: 0.55, ease, delay: 0.3 }}
          >
            Your first qualified prospect, verified email, and draft ready in under 2 minutes. Free to start.
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
              aria-label="Find your first leads free"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Find your first leads — free
              <ArrowRight className="w-4 h-4" />
            </motion.button>

            <p
              className="mt-4 text-xs"
              style={{ color: "hsl(0 0% 100% / 0.2)" }}
            >
              No credit card required · Cancel anytime · 30-day money-back
            </p>
          </motion.div>
>>>>>>> origin/main
        </div>
      </div>
    </section>
  );
<<<<<<< HEAD
};
=======
};
>>>>>>> origin/main
