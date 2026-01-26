import { useEffect, useState } from "react";

interface Orb {
  id: number;
  size: number;
  x: number;
  y: number;
  duration: number;
  delay: number;
  color: "primary" | "accent" | "secondary";
}

export const AnimatedBackground = () => {
  const [orbs, setOrbs] = useState<Orb[]>([]);

  useEffect(() => {
    // Generate random orbs on mount
    const generatedOrbs: Orb[] = Array.from({ length: 6 }, (_, i) => ({
      id: i,
      size: Math.random() * 300 + 200, // 200-500px
      x: Math.random() * 100,
      y: Math.random() * 100,
      duration: Math.random() * 20 + 20, // 20-40s
      delay: Math.random() * -20,
      color: (["primary", "accent", "secondary"] as const)[i % 3],
    }));
    setOrbs(generatedOrbs);
  }, []);

  const getColorClass = (color: Orb["color"]) => {
    switch (color) {
      case "primary":
        return "bg-primary/20";
      case "accent":
        return "bg-accent/15";
      case "secondary":
        return "bg-purple-500/10";
    }
  };

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Base gradient overlay */}
      <div className="absolute inset-0 bg-gradient-hero" />
      
      {/* Floating orbs */}
      {orbs.map((orb) => (
        <div
          key={orb.id}
          className={`absolute rounded-full blur-3xl ${getColorClass(orb.color)} animate-float-orb`}
          style={{
            width: orb.size,
            height: orb.size,
            left: `${orb.x}%`,
            top: `${orb.y}%`,
            animationDuration: `${orb.duration}s`,
            animationDelay: `${orb.delay}s`,
            transform: "translate(-50%, -50%)",
            willChange: "transform",
            contain: "layout paint",
          }}
        />
      ))}

      {/* Subtle grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Radial gradient for depth */}
      <div 
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, hsl(261 75% 65% / 0.08) 0%, transparent 50%)',
        }}
      />

      {/* Noise texture overlay */}
      <div 
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
};
