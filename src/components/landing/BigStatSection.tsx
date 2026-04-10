export const BigStatSection = () => {
  return (
    <section className="py-20 border-y border-border/20 bg-muted/10">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3">
          {/* Stat 1 */}
          <div className="px-8 py-10 md:border-r border-border/20">
            <p className="text-6xl sm:text-7xl font-bold tracking-tight text-foreground">
              &lt; 2 min
            </p>
            <p className="text-sm text-muted-foreground/70 uppercase tracking-widest mt-2">
              from ICP to first lead
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              No list-building required
            </p>
          </div>

          {/* Stat 2 */}
          <div className="px-8 py-10 md:border-r border-border/20">
            <p className="text-6xl sm:text-7xl font-bold tracking-tight text-foreground">
              10.7%
            </p>
            <p className="text-sm text-muted-foreground/70 uppercase tracking-widest mt-2">
              reply rate on signal-based sequences
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              vs 3.4% industry average
            </p>
          </div>

          {/* Stat 3 */}
          <div className="px-8 py-10">
            <p className="text-6xl sm:text-7xl font-bold tracking-tight text-foreground">
              1 tool
            </p>
            <p className="text-sm text-muted-foreground/70 uppercase tracking-widest mt-2">
              search, enrich, write, send
            </p>
            <p className="text-xs text-muted-foreground/50 mt-1">
              Stop switching between 4 apps
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
