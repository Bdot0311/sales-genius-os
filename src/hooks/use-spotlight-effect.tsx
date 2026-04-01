import { useEffect } from "react";

/**
 * Hook to enable cursor-following spotlight effect on cards
 * Adds CSS custom properties --mouse-x and --mouse-y to elements with .spotlight-card
 */
export const useSpotlightEffect = () => {
  useEffect(() => {
    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      const cards = document.querySelectorAll('.card-hover-lift');
      
      cards.forEach((card) => {
        const rect = (card as HTMLElement).getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        // Only update if mouse is near the card
        if (x >= -20 && x <= 120 && y >= -20 && y <= 120) {
          (card as HTMLElement).style.setProperty('--mouse-x', `${x}%`);
          (card as HTMLElement).style.setProperty('--mouse-y', `${y}%`);
        }
      });
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);
};
