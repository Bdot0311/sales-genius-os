import { lazy, Suspense, useState } from "react";

const DashboardMockup = lazy(() => import("@/components/landing/DashboardMockup"));

export const ProductShowcase = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <section
      className="relative overflow-hidden pb-4 sm:pb-0"
      style={{ background: "hsl(0,0%,3%)" }}
      aria-label="Product preview"
    >
      <div
        className="absolute top-0 left-0 right-0 z-10 h-24 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, hsl(0,0%,3%), transparent)",
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-5 sm:px-8 lg:px-12">
        <p className="pt-6 mb-6 text-center text-xs uppercase tracking-[0.25em] text-white/25 sm:pt-8 sm:mb-8">
          The platform
        </p>

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
              filter: "blur(30px)",
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

            <div
              className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none sm:h-40"
              style={{
                background:
                  "linear-gradient(to top, hsl(0,0%,3%) 0%, transparent 100%)",
              }}
              aria-hidden="true"
            />
          </div>
        </div>

        {/* Integration strip — below the mockup */}
        <div className="flex flex-col items-center gap-3 pt-10 pb-14">
          <p
            className="text-[10px] uppercase tracking-[0.22em] font-medium"
            style={{ color: "hsl(0 0% 100% / 0.18)" }}
          >
            Connects with the tools you already use
          </p>
          <div className="flex items-center flex-wrap justify-center gap-x-6 gap-y-2">
            {["Gmail", "HubSpot", "Salesforce", "Slack", "Calendly", "Zapier"].map((name) => (
              <span
                key={name}
                className="text-xs font-medium tracking-wide"
                style={{ color: "hsl(0 0% 100% / 0.25)" }}
              >
                {name}
              </span>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
};
