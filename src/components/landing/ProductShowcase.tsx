import { lazy, Suspense } from "react";
import { IntegrationStrip } from "@/components/landing/IntegrationLogos";

const DashboardMockup = lazy(() => import("@/components/landing/DashboardMockup"));

export const ProductShowcase = () => {
  return (
    <section
      className="relative overflow-hidden"
      style={{ background: "hsl(34 33% 96%)" }}
      aria-label="Product preview"
    >
      <div className="mx-auto w-full max-w-[1120px] px-6 sm:px-8">
        {/* Eyebrow row */}
        <div className="flex items-center justify-center gap-3 pt-6 sm:pt-10">
          <span className="hairline w-10" />
          <span className="eyebrow-muted">The platform</span>
          <span className="hairline w-10" />
        </div>

        {/* Dashboard frame — warm-dark card with soft coral glow beneath */}
        <div className="relative mx-auto mt-10 w-full max-w-5xl">
          {/* Soft coral shadow below */}
          <div
            className="pointer-events-none absolute -bottom-10 left-6 right-6 h-24 rounded-[100%] blur-3xl"
            style={{ background: "hsl(14 75% 70% / 0.35)" }}
            aria-hidden="true"
          />

          <div
            className="dark-frame relative overflow-hidden rounded-[24px] p-3 sm:p-4"
            style={{
              border: "1px solid hsl(28 10% 22%)",
              boxShadow:
                "0 1px 0 hsl(34 33% 100% / 0.06) inset, 0 30px 80px -30px hsl(28 10% 10% / 0.35), 0 10px 30px -10px hsl(14 59% 55% / 0.18)",
            }}
          >
            <div
              className="overflow-hidden rounded-[16px]"
              style={{ background: "hsl(28 8% 10%)", border: "1px solid hsl(28 10% 18%)" }}
            >
              <Suspense
                fallback={
                  <div
                    className="w-full"
                    style={{ aspectRatio: "16/9", background: "hsl(28 8% 12%)" }}
                  />
                }
              >
                <DashboardMockup />
              </Suspense>
            </div>
          </div>
        </div>

        {/* Integration strip — keeps the #integrations anchor */}
        <IntegrationStrip
          id="integrations"
          className="scroll-mt-24 pt-20 pb-20"
        />
      </div>
    </section>
  );
};
