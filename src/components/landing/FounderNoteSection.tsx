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
      className="relative py-28 md:py-40 overflow-hidden"
      style={{ background: "hsl(261 75% 2% / 0.82)" }}
      aria-labelledby="founder-note-heading"
    >
      {/* Top hairline */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "hsl(261 75% 50% / 0.18)" }}
      />

      {/* Purple glow — center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, hsl(261 75% 55% / 0.07) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-3xl mx-auto">

          {/* Giant opening quotation mark */}
          <div
            className={`font-display leading-none mb-4 select-none transition-all duration-700 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
            style={{
              fontSize: "clamp(5rem, 12vw, 10rem)",
              fontWeight: 800,
              fontStyle: "italic",
              color: "hsl(261 75% 55% / 0.4)",
              lineHeight: 0.8,
            }}
            aria-hidden="true"
          >
            "
          </div>

          {/* Opening line — display scale */}
          <p
            id="founder-note-heading"
            className={`font-display italic mb-10 transition-all duration-700 delay-100 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
            }`}
            style={{
              fontSize: "clamp(1.6rem, 3.5vw, 2.6rem)",
              fontWeight: 800,
              lineHeight: 1.2,
              letterSpacing: "-0.01em",
              color: "hsl(0 0% 90%)",
            }}
          >
            I was paying $500/month for Apollo and still spending three hours a day finding people to email.
          </p>

          {/* Body */}
          <div
            className={`space-y-5 mb-12 transition-all duration-700 delay-200 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <p
              className="text-base leading-relaxed"
              style={{ color: "hsl(0 0% 100% / 0.7)" }}
            >
              The data was fine. But I was living across five tabs. Export from Apollo, paste into a sheet, figure out who to prioritize, write a different email for each one, then chase replies in my inbox while forgetting which follow-up was next. It was a part-time job on top of the actual job.
            </p>
            <p
              className="text-base leading-relaxed"
              style={{ color: "hsl(0 0% 100% / 0.7)" }}
            >
              I built SalesOS because no single tool did all of it. Describe who you want, see who fits, draft the email, track the thread. That's the whole job. That's the whole product.
            </p>
          </div>

          {/* Signature */}
          <div
            className={`transition-all duration-700 delay-300 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <div
              className="h-px mb-6 w-12"
              style={{ background: "hsl(261 75% 55% / 0.4)" }}
            />
            <div className="flex items-center gap-3">
              {/* Founder avatar — swap src for a real photo when ready */}
              <div
                className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white select-none"
                style={{
                  background:
                    "linear-gradient(135deg, hsl(261 75% 55%), hsl(280 80% 65%))",
                }}
                aria-hidden="true"
              >
                B
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p
                    className="text-sm font-medium"
                    style={{ color: "hsl(0 0% 70%)" }}
                  >
                    Brandon, Founder of SalesOS
                  </p>
                  <a
                    href="https://www.linkedin.com/in/buildwitbrandon"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs transition-colors duration-200"
                    style={{ color: "hsl(261 75% 55% / 0.55)" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "hsl(261 75% 72%)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "hsl(261 75% 55% / 0.55)")
                    }
                    aria-label="Brandon on LinkedIn"
                  >
                    ↗ LinkedIn
                  </a>
                </div>
                <p
                  className="text-xs mt-0.5"
                  style={{ color: "hsl(0 0% 100% / 0.25)" }}
                >
                  Built in NYC · Launched 2026
                </p>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div
            className={`mt-10 flex items-center gap-6 transition-all duration-700 [transition-delay:400ms] ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
          >
            <button
              onClick={() => navigate("/auth")}
              className="text-sm font-medium transition-colors duration-200"
              style={{ color: "hsl(261 75% 65%)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "hsl(261 75% 80%)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "hsl(261 75% 65%)")
              }
            >
              Try it free →
            </button>
            <button
              onClick={() => navigate("/pricing")}
              className="text-sm transition-colors duration-200"
              style={{ color: "hsl(0 0% 100% / 0.3)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "hsl(0 0% 100% / 0.6)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "hsl(0 0% 100% / 0.3)")
              }
            >
              View plans →
            </button>
          </div>
        </div>
      </div>

      {/* Bottom hairline */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: "hsl(261 75% 50% / 0.18)" }}
      />
    </section>
  );
};
