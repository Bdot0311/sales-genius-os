import { useEffect, useRef, useState } from "react";
import { Mail, Sparkles, Reply } from "lucide-react";

const subject = "Quick idea for Northline's outbound hiring push";
const body = `Hey Jordan — noticed Northline is hiring SDRs and growing the sales team in NYC.\n\nThat usually means more pressure to build a repeatable prospecting workflow fast. SalesOS is designed to help teams describe their ICP in plain English, find better-fit leads, and launch more personalized outreach without spending hours building lists manually.\n\nIf helpful, I can show you what that workflow could look like for a team like yours.`;

export const ExampleOutreachSection = () => {
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
      aria-labelledby="example-outreach-heading"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className={`text-center mb-14 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-5">
              Example output
            </div>
            <h2 id="example-outreach-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Turn lead context into outreach
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Generate more relevant outbound from the lead and company details already inside SalesOS.
            </p>
          </div>

          <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-6 items-start">
            <div className={`rounded-2xl border border-border/30 bg-card/40 p-6 scroll-reveal ${isVisible ? 'visible' : ''}`}>
              <div className="flex items-center gap-2 mb-4 text-sm font-medium text-foreground">
                <Sparkles className="w-4 h-4 text-primary" />
                Built for outbound teams
              </div>
              <ul className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                <li>• Use lead context to make first-touch emails more specific.</li>
                <li>• Reduce time spent drafting outreach from scratch.</li>
                <li>• Keep messaging closer to the account, role, and buying signal.</li>
              </ul>
              <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <p className="text-xs font-medium text-primary mb-1">SalesOS output</p>
                <p className="text-sm text-muted-foreground">
                  Outreach drafts are generated from the same lead context your team is already reviewing.
                </p>
              </div>
            </div>

            <div className={`rounded-2xl border border-border/30 bg-card/40 p-6 scroll-reveal ${isVisible ? 'visible' : ''}`} style={{ '--reveal-delay': '100ms' } as React.CSSProperties}>
              <div className="flex items-center gap-2 mb-4 text-sm font-medium text-foreground">
                <Mail className="w-4 h-4 text-primary" />
                Sample outreach draft
              </div>
              <div className="rounded-xl border border-border/20 bg-background/70 p-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Subject</p>
                <p className="text-sm font-medium text-foreground mb-4">{subject}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Body</p>
                <div className="whitespace-pre-line text-sm text-muted-foreground leading-relaxed">
                  {body}
                </div>
              </div>
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-border/20 bg-muted/20 p-4">
                <Reply className="w-4 h-4 text-primary mt-0.5" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Review the draft, refine the message, and move into live outreach with less manual setup.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
