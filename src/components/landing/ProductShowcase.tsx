import { lazy, Suspense, useState } from "react";

const DashboardMockup = lazy(() => import("@/components/landing/DashboardMockup"));

export const ProductShowcase = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <section
      className="relative pb-0 overflow-hidden"
      style={{ background: "hsl(0,0%,3%)" }}
      aria-label="Product preview"
    >
      {/* Top fade from hero */}
      <div
        className="absolute top-0 left-0 right-0 h-24 pointer-events-none z-10"
        style={{
          background: "linear-gradient(to bottom, hsl(0,0%,3%), transparent)",
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-4 sm:px-8 lg:px-12">
        {/* Section label */}
        <p className="text-center text-xs uppercase tracking-[0.25em] text-white/25 mb-8 pt-8">
          The platform
        </p>

        {/* Mockup wrapper */}
        <div
          className="relative w-full max-w-6xl mx-auto cursor-pointer"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Glow behind the mockup */}
          <div
            className="absolute inset-x-20 top-8 bottom-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at 50% 80%, hsl(261 75% 55% / 0.2) 0%, transparent 70%)",
              filter: "blur(30px)",
            }}
            aria-hidden="true"
          />

          {/* The actual mockup */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              border: "1px solid hsl(0 0% 100% / 0.08)",
              boxShadow:
                "0 0 0 1px hsl(261 75% 55% / 0.1), 0 40px 100px -20px hsl(0 0% 0% / 0.7), 0 0 80px -20px hsl(261 75% 55% / 0.15)",
              transform: hovered
                ? "perspective(1200px) rotateX(0deg) scale(1.005)"
                : "perspective(1200px) rotateX(5deg) scale(1)",
              transformOrigin: "center bottom",
              transition: "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <Suspense
              fallback={
                <div
                  className="w-full bg-card/90"
                  style={{ aspectRatio: "16/9" }}
                />
              }
            >
              <DashboardMockup />
            </Suspense>

            {/* Bottom screen fade */}
            <div
              className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to top, hsl(0,0%,3%) 0%, transparent 100%)",
              }}
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
