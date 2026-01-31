import { useEffect, useRef, useState } from "react";
import { Shield, Zap, Lock, Globe } from "lucide-react";

const trustSignals = [
  { icon: Shield, label: "SOC 2 Compliant" },
  { icon: Lock, label: "Data Encrypted" },
  { icon: Zap, label: "99.9% Uptime" },
  { icon: Globe, label: "GDPR Ready" },
];

export const LogoBar = () => {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref} 
      className="relative py-12 md:py-16"
    >
      {/* Top hairline separator */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
      
      <div className="container mx-auto px-6">
        <div className="max-w-[1120px] mx-auto">
          <p className={`text-center text-sm text-muted-foreground/80 mb-8 scroll-reveal ${isVisible ? 'visible' : ''}`}>
            Built with enterprise-grade security
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
            {trustSignals.map((signal, i) => {
              const Icon = signal.icon;
              return (
                <div 
                  key={i}
                  className={`flex items-center gap-2 text-muted-foreground/60 scroll-reveal ${isVisible ? 'visible' : ''}`}
                  style={{ '--reveal-delay': `${i * 50}ms` } as React.CSSProperties}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{signal.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Bottom hairline separator */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />
    </div>
  );
};
