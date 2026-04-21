export const BigStatSection = () => {
  const stats = [
    {
      value: "< 2",
      unit: "min",
      label: "From ICP to first lead",
      sub: "No list-building required",
    },
    {
      value: "10.7",
      unit: "% reply",
      label: "Signal-based sequences",
      sub: "vs 3.4% industry average",
    },
    {
      value: "1",
      unit: "tool",
      label: "Search, enrich, write, send",
      sub: "Stop switching between four apps",
    },
  ];

  return (
    <section
      className="relative py-24 sm:py-32"
      style={{
        background: "hsl(34 33% 96%)",
        borderTop: "1px solid hsl(28 10% 88%)",
        borderBottom: "1px solid hsl(28 10% 88%)",
      }}
      aria-label="Key outcomes"
    >
      {/* Subtle warm wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, hsl(14 75% 82% / 0.28) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-[1120px] px-6 sm:px-8">
        <div className="mb-12 flex items-center justify-center gap-3">
          <span className="hairline w-10" />
          <span className="eyebrow">By the numbers</span>
          <span className="hairline w-10" />
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-6">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="flex flex-col items-start px-6 md:px-10"
              style={{
                borderLeft:
                  i > 0 ? "1px solid hsl(28 10% 84%)" : "1px solid transparent",
              }}
            >
              <div className="flex items-baseline gap-3">
                <span
                  className="editorial-stat"
                  style={{ fontSize: "clamp(3.2rem, 6vw, 5.25rem)" }}
                >
                  {stat.value}
                </span>
                <span className="stat-unit pb-2">{stat.unit}</span>
              </div>

              <span
                className="mt-5 text-[15px] font-medium"
                style={{ color: "hsl(28 10% 14%)" }}
              >
                {stat.label}
              </span>
              <span className="mt-1 text-sm" style={{ color: "hsl(28 6% 48%)" }}>
                {stat.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
