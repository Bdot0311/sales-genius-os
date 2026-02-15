import { X, Check } from "lucide-react";

const typicalStack = [
  "5–7 disconnected tools",
  "Manual follow-ups",
  "Fragmented data across platforms",
  "Reactive, unstructured outreach",
  "No performance intelligence",
];

const salesosStack = [
  "One unified operating system",
  "Automated sequencing engine",
  "Centralized data layer",
  "Engineered outbound workflows",
  "Built-in optimization & coaching",
];

export const StackComparisonSection = () => {
  return (
    <section className="relative py-16 md:py-24 overflow-hidden" aria-labelledby="stack-comparison-heading">
      <div className="noise-texture" aria-hidden="true" />

      <div className="container mx-auto px-4 sm:px-6 max-w-[1120px]">
        <h2
          id="stack-comparison-heading"
          className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-center mb-4"
        >
          Why Your Stack Is{" "}
          <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Slowing You Down
          </span>
        </h2>
        <p className="text-muted-foreground text-center max-w-lg mx-auto mb-12 text-sm sm:text-base">
          You don't need more tools. You need one system that replaces them all.
        </p>

        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
          {/* Typical Stack */}
          <div className="rounded-xl border border-border/30 bg-card/40 p-6 sm:p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5">
              Typical Stack
            </h3>
            <ul className="space-y-4">
              {typicalStack.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <X className="w-4 h-4 text-destructive/70 mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* SalesOS */}
          <div className="rounded-xl border border-primary/20 bg-primary/[0.03] p-6 sm:p-8 relative overflow-hidden">
            {/* Subtle glow */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

            <h3 className="text-sm font-semibold uppercase tracking-wider text-primary mb-5 relative">
              <span className="text-foreground">Sales</span><span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">OS</span>
            </h3>
            <ul className="space-y-4 relative">
              {salesosStack.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-foreground">
                  <Check className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};
