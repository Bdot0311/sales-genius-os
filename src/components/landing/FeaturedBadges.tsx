import { useState } from "react";
import { FEATURED_BADGES } from "@/lib/directory-badges";

/**
 * The two or three directory badges worth showing beside the CTA.
 *
 * Three constraints shape this, and they are the reasons not to simply move
 * the footer row up:
 *
 * 1. It must not touch LCP. These are third-party images on small hosts, so
 *    they are fetched at low priority and never become the largest paint —
 *    the row is deliberately small and sits below the fold-line content.
 * 2. It must not shift the page. Every badge carries its intrinsic width and
 *    height, and the row has a reserved height, so a slow badge leaves a gap
 *    rather than pushing the copy underneath it.
 * 3. A badge that 404s must disappear, not display a broken-image icon next
 *    to the primary call to action. Several of these are served from hosts
 *    with no uptime guarantee — one is a WordPress upload, another a
 *    workers.dev subdomain — and a broken image beside "Get your free campaign
 *    setup" costs more trust than the badge ever earned.
 *
 * The whole row hides itself if every badge fails, so the outcome of a bad day
 * for three small hosts is the page it was before this component existed.
 */
export function FeaturedBadges({ className = "" }: { className?: string }) {
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const shown = FEATURED_BADGES.filter((b) => !broken.has(b.href));

  if (shown.length === 0) return null;

  return (
    <ul
      className={`flex h-10 list-none items-center justify-center gap-5 p-0 opacity-70 transition-opacity duration-200 hover:opacity-100 ${className}`}
      aria-label="Directory listings"
    >
      {shown.map((b) => (
        <li key={b.href} className="flex items-center">
          <a href={b.href} target="_blank" rel="noopener noreferrer">
            <img
              src={b.src}
              alt={b.alt}
              width={b.w}
              height={b.h}
              // Eager, because lazy-loading something this close to the top
              // just guarantees it arrives late; low priority, because it must
              // not compete with the hero for bandwidth.
              loading="eager"
              fetchPriority="low"
              decoding="async"
              className="h-9 w-auto object-contain"
              onError={() => setBroken((prev) => new Set(prev).add(b.href))}
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
