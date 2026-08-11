import { useState } from "react";
import { IntegrationStrip } from "@/components/landing/IntegrationLogos";
import DashboardMockup from "@/components/landing/DashboardMockup";

export const ProductShowcase = () => {
  const [hovered, setHovered] = useState(false);


  return (
    <section
      className="relative z-0 mt-10 pb-4 sm:mt-12 sm:pb-0"
      aria-label="Product preview"
    >
      <div className="container mx-auto px-5 sm:px-8 lg:px-12">
        <div
          className="relative mx-auto w-full max-w-6xl"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div
            className="absolute inset-x-6 top-6 bottom-0 pointer-events-none sm:inset-x-20 sm:top-8"
            style={{
              background:
                "radial-gradient(ellipse at 50% 80%, hsl(261 75% 55% / 0.2) 0%, transparent 70%)",
                opacity: 0.75,
            }}
            aria-hidden="true"
          />

          <div
            className="relative overflow-hidden rounded-[24px] sm:rounded-2xl"
            style={{
              border: "1px solid hsl(0 0% 100% / 0.08)",
              boxShadow:
                "0 0 0 1px hsl(261 75% 55% / 0.1), 0 40px 100px -20px hsl(0 0% 0% / 0.7), 0 0 80px -20px hsl(261 75% 55% / 0.15)",
              transform: hovered
                ? "perspective(1200px) rotateX(0deg) scale(1.005)"
                : "perspective(1200px) rotateX(2deg) scale(1)",
              transformOrigin: "center bottom",
              transition: "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <DashboardMockup />

            <div
              className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none sm:h-40"
              style={{
                background:
                  "linear-gradient(to top, hsl(261 75% 2%) 0%, transparent 100%)",
              }}
              aria-hidden="true"
            />
          </div>
        </div>

        <p className="pt-6 mb-2 text-center text-xs uppercase tracking-[0.25em] sm:pt-8" style={{ color: "hsl(261 75% 72%)" }}>
          The platform
        </p>

        {/* Integration strip — below the mockup. Also serves as the #integrations anchor for the navbar. */}
        <IntegrationStrip
          id="integrations"
          className="scroll-mt-24 pt-6 pb-14 sm:pt-8"
        />

      </div>
    </section>
  );
};
