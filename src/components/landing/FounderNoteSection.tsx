import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export const FounderNoteSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.15 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative py-24 md:py-32 overflow-hidden bg-muted/20"
      aria-labelledby="founder-note-heading"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="container relative z-10 mx-auto px-6">
        <div
          className={`max-w-2xl mx-auto transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          }`}
        >
          {/* Quote card */}
          <div className="relative rounded-2xl border border-border/30 bg-card/60 p-8 md:p-12 border-l-4 border-l-primary/30">
            {/* Opening line */}
            <p
              id="founder-note-heading"
              className="text-2xl sm:text-3xl font-light italic leading-relaxed text-foreground"
            >
              "I was paying $500/month for Apollo and still spending three hours
              a day on LinkedIn."
            </p>

            {/* Body */}
            <div className="mt-6 space-y-4 text-base text-muted-foreground leading-relaxed">
              <p>
                The data wasn't the problem. The workflow was. I'd export a
                list, paste it into a spreadsheet, score it manually, write
                emails one at a time, and track replies in a separate inbox.
                Four tools. Six context switches. Most of it was just overhead.
              </p>
              <p>
                SalesOS is what I wanted to exist — one place to describe who I
                want to reach, see who's actually worth reaching out to, and
                send something worth reading. It's not magic. It's just the
                workflow that should have existed years ago.
              </p>
            </div>

            {/* Signature */}
            <div className="mt-8 pt-6 border-t border-border/20">
              <p className="text-sm font-medium text-foreground">
                — Brandon, Founder of SalesOS
              </p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                Built in NYC · Launched 2024
              </p>
            </div>
          </div>

          {/* Below-card CTAs */}
          <div className="mt-8 flex items-center gap-6 pl-1">
            <button
              onClick={() => navigate("/pricing")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              View plans &rarr;
            </button>
            <button
              onClick={() => navigate("/auth")}
              className="text-sm text-foreground font-medium hover:text-primary transition-colors duration-200"
            >
              Try it free &rarr;
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
