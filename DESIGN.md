# Design

## Visual Direction

Linear precision × Lemon Squeezy/Loops warmth. Dark, committed, no hedging. Every section earns its place. The product is the proof — show the mechanism, not a description of it.

Not: AI slop purple gradients on white. Not: Apollo feature-grid coldness. Not: Webflow over-animation. Not: committee-approved HubSpot blue.

Yes: near-black canvas, a single violet thread, generous space, large confident type, motion that reveals rather than decorates.

## Color

```
Background:        hsl(0,0%,3%)          — hero/section base (committed near-black)
Surface/Card:      hsl(224 11% 9%)       — card backgrounds
Surface elevated:  hsl(224 11% 10%)      — popovers, modals
Border:            hsl(224 10% 15%)      — default border
Border subtle:     hsl(0 0% 100% / 0.07) — section dividers, hairlines

Primary:           hsl(261 75% 63%)      — violet, the only accent
Primary hover:     hsl(261 75% 72%)
Primary dim:       hsl(261 75% 55%)

Gradient primary:  linear-gradient(135deg, hsl(261,75%,63%), hsl(280,70%,58%))
Gradient text:     linear-gradient(135deg, hsl(261 75% 72%) 0%, hsl(280 80% 68%) 50%, hsl(261 75% 60%) 100%)

Foreground:        hsl(220 9% 97%)       — primary text
Text muted:        hsl(0 0% 100% / 0.55) — body copy
Text dim:          hsl(0 0% 100% / 0.30) — supporting/fine print
Text faint:        hsl(0 0% 100% / 0.20) — captions
Text disabled:     hsl(0 0% 100% / 0.15)

Hairline purple:   hsl(261 75% 50% / 0.18) — top/bottom section borders
```

## Typography

```
Display font:   Playfair Display (Google Fonts)
  — Headlines, section titles, the italic gradient spans
  — Weights: 700, 800
  — Style: normal for primary headline line; italic for accent/gradient line
  — Letter spacing: -0.02em
  — Line height: 1.02–1.1

Body font:      system-ui / sans-serif
  — All body copy, UI labels, badges, buttons
  — Normal weight (400) for body, 500 for labels, 600 for CTAs

Scale (clamp):
  Hero H1:       clamp(2.25rem, 9vw, 7rem)   lh 1.02
  Section H2:    clamp(2rem, 4vw, 3.2rem)     lh 1.1
  Final CTA H2:  clamp(3rem, 8vw, 7rem)       lh 1.04
  Body large:    1.25rem (xl)                  lh relaxed
  Body:          1rem (base)                   lh relaxed
  Small:         0.875rem (sm)
  Label/eyebrow: 10px, uppercase, tracking-[0.28em]
```

## Spacing

8px base scale. Section vertical rhythm: `py-24 md:py-36` standard, `py-40 md:py-52` for hero-weight sections. Container: centered, max `2xl` (1400px), `px-6` gutters.

## Texture & Atmosphere

Dot grid (hero background):
```css
background-image: radial-gradient(circle, hsl(0 0% 100% / 0.06) 1px, transparent 1px);
background-size: 32px 32px;
```

Floating orbs (hero corners):
- Bottom-left: `hsl(261 75% 55% / 0.18)` violet, 360px mobile / 600px desktop
- Bottom-right: `hsl(280 70% 60% / 0.14)` purple, 320px mobile / 500px desktop
- Float animation: slow 18s ease-in-out loop, subtle translate

Top center bleed (hero):
```css
radial-gradient(ellipse at center top, hsl(261 75% 55% / 0.08) 0%, transparent 65%)
```

Noise texture: global SVG noise overlay at `opacity: 0.04`

Section glow: centered radial, `hsl(261 75% 50% / 0.14)` blurred 60px — for FinalCTA and hero-weight sections.

## Components

### CTA Button (Primary)
```
Pill shape: border-radius 9999px
Height: 52px standard, 56px final-CTA weight
Padding: px-8 (standard), px-10 (large)
Background: linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))
Text: white, text-sm, font-semibold
Trailing icon: ArrowRight 16px, translates +0.5px on hover
Glow: class cta-pill-glow (box-shadow glow pulse animation)
```

### Secondary Link
```
Height: 44–52px
Text: text-sm, text-white/60 → text-white/80 on hover
Trailing arrow: ArrowRight 14px
```

### Trust Signal Cards
```
Border-radius: rounded-xl
Border: border-white/[0.06]
Background: bg-white/[0.02]
Padding: px-4 py-3
Icon: violet-400, 16px
Text: text-xs font-medium text-white/70
Grid: 2-col mobile → 4-col desktop
```

### Section Eyebrow Label
```
font-size: 10px
text-transform: uppercase
letter-spacing: 0.28em
font-weight: 500
color: hsl(261 75% 60%)
margin-bottom: 20px (5)
```

### Hairlines (section dividers)
```
height: 1px
background: hsl(261 75% 50% / 0.18)
position: absolute top-0 / bottom-0
```

### Badge/Pill (status)
```
Border: border-white/10
Background: bg-white/5
Padding: px-4 py-2
Border-radius: rounded-full
Text: text-xs text-white/60
```

## Motion

Entry animations — IntersectionObserver at threshold 0.1–0.2:
```
opacity: 0 → 1
translateY: 8–16px → 0
duration: 700ms
easing: default (ease)
staggered delays: 0ms, 100ms, 200ms, 300ms, 400ms
```

Orb float: `18s ease-in-out infinite`, second orb `animationDelay: 6s`

Glow pulse: `2s ease-in-out infinite`, `box-shadow` from 20px/0.3 to 40px/0.6

Hover transitions: `200ms` for color/transform. `150ms` for links.

`prefers-reduced-motion`: All animations respect this. Intersection animations fire immediately, orbs static, glow pulse disabled.

## Layout Patterns

### Hero
- Full-viewport height (hero-fullscreen class)
- Flex column, items centered, justify-start on mobile / justify-center on desktop
- Content stack: badge pill → H1 → subhead → CTA row → trust line → trust signals grid

### Centered Editorial (FounderNote, FAQ)
- Max-width: `max-w-3xl` (founder) / `max-w-[720px]` (FAQ)
- mx-auto
- Left-aligned on mobile if >2 lines; always centered labels

### Section Structure
```
<section> (relative, overflow-hidden, py-24 md:py-36, background: hsl(0,0%,3%))
  <div> top hairline (absolute top-0)
  <div> background glow/orb (absolute, pointer-events-none)
  <div> container relative z-10
    eyebrow label
    H2 (display font)
    content
  <div> bottom hairline (absolute bottom-0, if needed)
```

## Reference Sites

Linear: precision grid, committed dark, single accent color, generous whitespace, mechanisms shown not described.

Lemon Squeezy / Loops: warmth without softness, founder voice, direct copy, proof over claims, clean scroll sections.
