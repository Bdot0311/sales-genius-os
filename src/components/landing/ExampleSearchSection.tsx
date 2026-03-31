import { useEffect, useRef, useState } from "react";
import { Search, Building2, User, Mail, ArrowRight } from "lucide-react";

const sampleSearch = "Find heads of sales at NYC B2B SaaS companies with 10-100 employees hiring SDRs";

const sampleLeads = [
  {
    name: "Jordan Park",
    title: "Head of Sales",
    company: "Northline",
    fit: "High fit",
    details: "NYC · 45 employees · B2B SaaS · Hiring 2 SDRs",
    email: "jordan@northline.com",
  },
  {
    name: "Rina Shah",
    title: "VP Revenue",
    company: "SignalFox",
    fit: "Good fit",
    details: "Brooklyn · 82 employees · PLG SaaS · Expanding outbound",
    email: "rina@signalfox.com",
  },
  {
    name: "Alex Müller",
    title: "Director of Sales",
    company: "GraphiteIQ",
    fit: "Good fit",
    details: "Manhattan · 28 employees · B2B SaaS · Recently funded",
    email: "alex@graphiteiq.com",
  },
];

export const ExampleSearchSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.15 }
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative py-24 md:py-32 overflow-hidden"
      aria-labelledby="example-search-heading"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className={`text-center mb-14 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-5">
              Concrete example
            </div>
            <h2 id="example-search-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              This is what the workflow should feel like
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Instead of abstract marketing promises, here is a realistic example of how someone might use SalesOS to find and act on a target list.
            </p>
          </div>

          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-6 items-start">
            <div className={`rounded-2xl border border-border/30 bg-card/40 p-6 scroll-reveal ${isVisible ? 'visible' : ''}`}>
              <div className="flex items-center gap-2 mb-4 text-sm font-medium text-foreground">
                <Search className="w-4 h-4 text-primary" />
                Example search
              </div>
              <div className="rounded-xl border border-primary/20 bg-background/70 p-4 text-sm text-foreground leading-relaxed">
                “{sampleSearch}”
              </div>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                The point is speed: you describe who you want in normal language, then review a smaller set of leads that actually look worth contacting.
              </p>
            </div>

            <div className={`rounded-2xl border border-border/30 bg-card/40 p-6 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '100ms' } as React.CSSProperties}>
              <div className="flex items-center gap-2 mb-4 text-sm font-medium text-foreground">
                <Building2 className="w-4 h-4 text-primary" />
                Sample matched leads
              </div>
              <div className="space-y-3">
                {sampleLeads.map((lead, index) => (
                  <div key={index} className="rounded-xl border border-border/20 bg-background/60 p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{lead.name}</p>
                        <p className="text-xs text-muted-foreground">{lead.title} · {lead.company}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                        {lead.fit}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{lead.details}</p>
                    <div className="flex items-center gap-2 text-xs text-foreground/80">
                      <Mail className="w-3.5 h-3.5 text-primary" />
                      <span>{lead.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={`mt-10 rounded-2xl border border-border/30 bg-muted/20 p-6 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '180ms' } as React.CSSProperties}>
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-foreground">
              <User className="w-4 h-4 text-primary" />
              Why this matters
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If the workflow helps you move from “who should we target?” to “here are 10 people worth contacting” faster, the product is doing its job. That is the promise the homepage should keep reinforcing.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-primary font-medium">
              Search faster
              <ArrowRight className="w-4 h-4" />
              Review better-fit leads
              <ArrowRight className="w-4 h-4" />
              Launch outreach
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
