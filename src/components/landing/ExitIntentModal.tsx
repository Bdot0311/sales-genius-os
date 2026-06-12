import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

const STORAGE_KEY = "salesos-exit-intent-shown";

export const ExitIntentModal = () => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    // Desktop only — mobile has no mouse-leave equivalent that isn't annoying
    const isDesktop = window.matchMedia("(min-width: 768px) and (hover: hover)").matches;
    if (!isDesktop) return;

    let armed = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, 8000); // wait 8s before arming so we don't fire on accidental tab-switch

    const handler = (e: MouseEvent) => {
      if (!armed) return;
      // Only fire when cursor leaves toward the top (address bar / tab close)
      if (e.clientY > 0) return;
      if (sessionStorage.getItem(STORAGE_KEY)) return;
      sessionStorage.setItem(STORAGE_KEY, "1");
      setOpen(true);
    };

    document.addEventListener("mouseleave", handler);
    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener("mouseleave", handler);
    };
  }, []);

  const close = () => setOpen(false);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="exit-intent-title"
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[hsl(0,0%,5%)] p-7 shadow-2xl sm:p-9"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, hsl(261 75% 60% / 0.6), transparent)",
              }}
            />

            <button
              onClick={close}
              className="absolute right-4 top-4 rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white/80"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-violet-400/80">
              Before you go
            </p>
            <h2
              id="exit-intent-title"
              className="mb-3 font-display text-2xl font-bold text-white sm:text-[1.65rem]"
              style={{ letterSpacing: "-0.01em", lineHeight: 1.15 }}
            >
              See OutReign find real leads in 60 seconds.
            </h2>
            <p className="mb-7 text-sm leading-relaxed text-white/55">
              Watch how plain-English search returns ranked, SMTP-verified prospects with a first-touch email already drafted.
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  close();
                  navigate("/demo");
                }}
                className="group inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold text-white transition-transform hover:scale-[1.01]"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)",
                }}
              >
                See how it works
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={close}
                className="h-10 text-xs text-white/40 transition-colors hover:text-white/70"
              >
                No thanks, I'll keep browsing
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
