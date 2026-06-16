interface CaseStudyData {
  company: string;
  role: string;
  quote: string;
  metric: string;
  metricLabel: string;
}

interface CaseStudyProps {
  // TODO: real data — add a verified case study here once available
  data?: CaseStudyData;
}

export const CaseStudy = ({ data }: CaseStudyProps) => {
  if (!data) return null;

  return (
    <section
      className="py-20 px-6"
      style={{ background: "hsl(261 75% 3%)" }}
      aria-labelledby="case-study-heading"
    >
      <div className="max-w-2xl mx-auto text-center">
        <p
          className="font-serif italic text-base mb-6"
          style={{ color: "hsl(261 75% 65%)" }}
        >
          In practice
        </p>
        <blockquote
          className="text-xl font-light leading-relaxed mb-8"
          style={{ color: "hsl(0 0% 88%)" }}
        >
          "{data.quote}"
        </blockquote>
        <div className="flex items-center justify-center gap-4 mb-8">
          <div>
            <p className="font-semibold text-sm" style={{ color: "hsl(0 0% 88%)" }}>
              {data.company}
            </p>
            <p className="text-xs" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
              {data.role}
            </p>
          </div>
        </div>
        <div className="inline-block rounded-xl px-8 py-4" style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)" }}>
          <span className="block font-display font-bold text-3xl" style={{ color: "hsl(261 75% 68%)" }}>
            {data.metric}
          </span>
          <span className="block text-xs mt-1" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
            {data.metricLabel}
          </span>
        </div>
      </div>
    </section>
  );
};
