import { useEffect, useRef, useState } from "react";

const logos = [
  { name: "Stripe", icon: "S" },
  { name: "Notion", icon: "N" },
  { name: "Slack", icon: "S" },
  { name: "Linear", icon: "L" },
  { name: "Figma", icon: "F" },
  { name: "Vercel", icon: "V" },
  { name: "GitHub", icon: "G" },
  { name: "Loom", icon: "L" },
];

export const LogoMarquee = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="py-16 border-y border-border/30 overflow-hidden">
      <div className="container mx-auto px-6 mb-8">
        <p className={`text-center text-sm text-muted-foreground transition-all duration-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          Trusted by teams at leading companies
        </p>
      </div>
      
      <div className="relative">
        {/* Gradient fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
        
        <div className="flex animate-marquee">
          {[...logos, ...logos].map((logo, i) => (
            <div
              key={i}
              className="flex items-center justify-center gap-3 px-10 py-4 mx-4"
            >
              <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center text-lg font-bold text-muted-foreground">
                {logo.icon}
              </div>
              <span className="text-lg font-medium text-muted-foreground whitespace-nowrap">
                {logo.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
