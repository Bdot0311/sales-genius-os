export const BigStatSection = () => {
  const stats = [
    {
      value: "< 2 min",
      label: "From ICP to first lead",
      sub: "No list-building required",
    },
    {
      value: "10.7%",
      label: "Reply rate on signal sequences",
      sub: "vs 3.4% industry average",
    },
    {
      value: "1 tool",
      label: "Search, enrich, write, send",
      sub: "Stop switching between 4 apps",
    },
  ];

  return (
    <section
      className="relative py-20 md:py-28"
      style={{
        borderTop: "1px solid hsl(0 0% 100% / 0.06)",
        borderBottom: "1px solid hsl(0 0% 100% / 0.06)",
        background: "hsl(0,0%,3%)",
      }}
    >
      {/* Faint center glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, hsl(261 75% 55% / 0.05) 0%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="container mx-auto px-6 max-w-5xl relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="flex flex-col items-center md:items-start text-center md:text-left px-8 py-6"
              style={{
                borderRight:
                  i < 2 ? "1px solid hsl(0 0% 100% / 0.07)" : undefined,
              }}
            >
              {/* Big number using display font */}
              <span
                className="font-display block mb-3"
                style={{
                  fontSize: "clamp(2.8rem, 5vw, 4.5rem)",
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  background:
                    "linear-gradient(135deg, hsl(0 0% 98%) 0%, hsl(0 0% 65%) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {stat.value}
              </span>
              <span
                className="block text-sm font-medium mb-1"
                style={{ color: "hsl(0 0% 75%)" }}
              >
                {stat.label}
              </span>
              <span
                className="block text-xs"
                style={{ color: "hsl(0 0% 38%)" }}
              >
                {stat.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
