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
          Your Stack Wasn't{" "}
          <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Built to Win.
          </span>
        </h2>
        <p className="text-muted-foreground text-center max-w-lg mx-auto mb-12 text-sm sm:text-base">
          You don't need more tools. You need one system that replaces them all.
        </p>

        <div className="grid md:grid-cols-[1fr_1px_1fr] gap-0 md:gap-8">
          {/* Typical Stack */}
          <div className="rounded-xl border border-border/30 bg-card/40 p-6 sm:p-8 md:border-0 md:rounded-none md:bg-transparent">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60 mb-6 flex items-center gap-2">
              <span className="w-6 h-px bg-muted-foreground/20" />
              Typical Stack
            </h3>
            <ul className="space-y-4">
              {typicalStack.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground/70">
                  <X className="w-3.5 h-3.5 text-destructive/50 mt-0.5 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Vertical divider */}
          <div className="hidden md:block bg-border/20" aria-hidden="true" />

          {/* SalesOS */}
          <div className="mt-4 md:mt-0 rounded-xl border border-primary/15 bg-primary/[0.02] p-6 sm:p-8 relative overflow-hidden md:border-0 md:rounded-none md:bg-transparent">
            <h3 className="text-xs font-semibold uppercase tracking-widest mb-6 relative flex items-center gap-2">
              <span className="w-6 h-px bg-primary/30" />
              <span className="text-foreground">Sales</span><span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">OS</span>
            </h3>
            <ul className="space-y-4 relative">
              {salesosStack.map((item, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-foreground/90">
                  <Check className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
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
