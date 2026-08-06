# Meld Product Mockup into Hero Section

Make the dashboard mockup below the hero visually overlap and rise into the hero area, so the landing page flows as one continuous scene instead of two distinct blocks.

## Design decisions
- Meld style: **Floating overlap** (chosen).
- "The platform" label and integration logos: **kept below the mockup**.
- Keep the existing hover 3D tilt effect on the mockup.
- Preserve the current dark/purple color palette and brand feel.

## Changes

### 1. HeroSection
- Reduce the bottom padding (`pb-16 sm:pb-20`) so the mockup can extend up into the hero without creating a large empty gap.
- Ensure the hero section is still `min-height: 100svh` but does not force the content to be vertically centered to the point that the overlap feels cramped.
- Keep the orb/gradient decorative elements but ensure the bottom of the hero visually fades/continues into the mockup area.

### 2. ProductShowcase
- Pull the section up with a negative top margin so the dashboard mockup overlaps the bottom of the hero section.
- Remove the separate dark background color (`hsl(261 75% 2% / 0.82)`) so the hero and showcase share one continuous background.
- Replace the top gradient fade with a subtler transition or remove it entirely to avoid a visible dividing line.
- Remove the `pt-6`/`pt-8` spacing before the mockup so the mockup starts closer to the hero content.
- Keep the "The platform" label and the integration strip below the mockup.

### 3. Mockup container
- Keep the rounded corners and the 3D hover tilt on the mockup.
- Add a subtle top shadow/glow so it appears to float above the hero background.
- Ensure the mockup is not cropped at the top of its container on any viewport.

### 4. Responsive checks
- Mobile: adjust the overlap amount so it doesn't push content off-screen or collide with the hero CTAs.
- Desktop: more overlap for the cinematic dashboard-floating-in-hero effect.

## Verification
- Open the landing page and scroll to the hero/mockup boundary.
- Confirm no visible hard line separates the two sections.
- Confirm the mockup overlaps the hero bottom on desktop and mobile.
- Confirm the "The platform" label and integration logos remain below the mockup.
- Confirm text and CTA inside the hero remain readable after the overlap.
