import { useEffect, useRef, useState } from "react";
import { MessageSquareHeart, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export const FounderNoteSection = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const navigate = useNavigate();

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
      aria-labelledby="founder-note-heading"
    >
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-4xl mx-auto">
          <div className={`rounded-3xl border border-border/30 bg-card/40 p-8 md:p-12 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-6">
                <MessageSquareHeart className="w-3.5 h-3.5" />
                Founder note
              </div>

              <h2 id="founder-note-heading" className="text-3xl sm:text-4xl font-bold tracking-tight mb-5">
                Built for teams that are tired of cobbling outbound together
              </h2>

              <div className="space-y-4 text-base text-muted-foreground leading-relaxed text-left sm:text-center">
                <p>
                  SalesOS was built around a simple frustration: too much outbound work still starts with messy filters, manual list-building, and a pile of disconnected tools.
                </p>
                <p>
                  SalesOS helps teams describe who they want to reach, find better-fit leads faster, and move into outreach without wasting hours on setup.
                </p>
                <p>
                  If you run founder-led sales, manage outbound for clients, or need a faster path from ICP to pipeline, that is exactly who SalesOS is for.
                </p>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button
                  size="lg"
                  className="group"
                  onClick={() => navigate('/pricing')}
                >
                  View plans
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => navigate('/auth')}
                >
                  Explore the workflow
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </section>
  );
};
