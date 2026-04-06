import { useEffect, useRef } from "react";

/**
 * Hook to enable cursor-following spotlight effect on cards.
 * Uses requestAnimationFrame to batch DOM reads/writes and avoid forced reflows.
 */
export const useSpotlightEffect = () => {
  const rafId = useRef<number>(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let mouseX = 0;
    let mouseY = 0;
    let ticking = false;

    const updateCards = () => {
      const cards = document.querySelectorAll('.card-hover-lift');
      // Batch all reads first
      const rects: DOMRect[] = [];
      cards.forEach((card) => {
        rects.push((card as HTMLElement).getBoundingClientRect());
      });
      // Then batch all writes
      cards.forEach((card, i) => {
        const rect = rects[i];
        const x = ((mouseX - rect.left) / rect.width) * 100;
        const y = ((mouseY - rect.top) / rect.height) * 100;
        if (x >= -20 && x <= 120 && y >= -20 && y <= 120) {
          (card as HTMLElement).style.setProperty('--mouse-x', `${x}%`);
          (card as HTMLElement).style.setProperty('--mouse-y', `${y}%`);
        }
      });
      ticking = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!ticking) {
        ticking = true;
        rafId.current = requestAnimationFrame(updateCards);
      }
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId.current);
    };
  }, []);
};
