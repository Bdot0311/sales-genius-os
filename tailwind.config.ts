import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        brand: '#3D81E3',
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      backgroundImage: {
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-secondary': 'var(--gradient-secondary)',
        'gradient-hero': 'var(--gradient-hero)',
      },
      boxShadow: {
        'glow': 'var(--shadow-glow)',
        'card': 'var(--shadow-card)',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px hsl(261 75% 65% / 0.3)" },
          "50%": { boxShadow: "0 0 40px hsl(261 75% 65% / 0.6)" },
        },
        "shiny": {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        // Indeterminate progress: the search is one upstream call, so there is
        // no percentage to show and a bar that pretends to fill would be a lie.
        "sweep": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(1100%)" },
        },
        // A candidate the pass keeps. It is struck by the edge, lifts out of
        // the field with a bloom, holds while the pass moves on, then settles
        // brighter than it started — found, not merely flashed at.
        "sift-lock": {
          "0%, 12%": {
            opacity: "0.22",
            transform: "translateY(0) scale(1)",
            boxShadow: "0 0 0 0 hsl(var(--primary) / 0)",
          },
          "30%": {
            opacity: "1",
            transform: "translateY(-3px) scale(1.55)",
            boxShadow: "0 0 12px 2px hsl(var(--primary) / 0.6)",
          },
          "58%": {
            opacity: "0.95",
            transform: "translateY(-2px) scale(1.3)",
            boxShadow: "0 0 7px 0 hsl(var(--primary) / 0.32)",
          },
          "100%": {
            opacity: "0.34",
            transform: "translateY(0) scale(1)",
            boxShadow: "0 0 0 0 hsl(var(--primary) / 0)",
          },
        },
        // One the pass drops: a moment of attention as the edge reaches it,
        // then it falls out of the field.
        "sift-dim": {
          "0%, 12%": { opacity: "0.2", transform: "translateY(0) scale(1)" },
          "28%": { opacity: "0.55", transform: "translateY(0) scale(1.12)" },
          "100%": { opacity: "0.05", transform: "translateY(4px) scale(0.82)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
        "shiny": "shiny 6s linear infinite",
        "sweep": "sweep 3.2s cubic-bezier(0.33, 0, 0.2, 1) infinite",
        "sift-lock": "sift-lock 3.2s cubic-bezier(0.22, 1, 0.36, 1) infinite",
        "sift-dim": "sift-dim 3.2s cubic-bezier(0.22, 1, 0.36, 1) infinite",
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      transitionProperty: {
        'smooth': 'var(--transition-smooth)',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
