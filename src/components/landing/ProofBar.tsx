import { BRAND } from "@/lib/brand";

interface MetricItem {
  value: string;
  label: string;
}

interface ProofBarProps {
  // TODO: real data — pass verified metrics once available
  metrics?: MetricItem[];
}

export const ProofBar = ({ metrics }: ProofBarProps) => {
  if (!metrics || metrics.length === 0) return null;

  return (
    <div
      className="w-full py-4 px-6 border-t border-b"
      style={{
        borderColor: "hsl(261 75% 50% / 0.15)",
        background: "hsl(261 75% 3% / 0.5)",
      }}
    >
      <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-8">
        {metrics.map(({ value, label }) => (
          <div key={label} className="text-center">
            <span
              className="block font-display font-bold text-xl"
              style={{ color: "hsl(261 75% 70%)" }}
            >
              {value}
            </span>
            <span className="block text-xs mt-0.5" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
              {label}
            </span>
          </div>
        ))}
        <p className="w-full text-center text-xs mt-2" style={{ color: "hsl(0 0% 100% / 0.35)" }}>
          Built in public by a founder running real outbound daily.{" "}
          <a
            href={BRAND.founderX}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            Follow the journey
          </a>
        </p>
      </div>
    </div>
  );
};
