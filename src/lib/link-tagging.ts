/**
 * Site-wide automatic link tagging + outbound click logging.
 *
 * Runs one delegated listener on the document instead of touching every anchor
 * by hand, so it covers every section of the landing page (hero, pricing,
 * founder note, footer badges, social links) and anything added later:
 *
 *  - Links to our own site keep the visitor's utm params across hard
 *    navigations, so attribution survives a click into /pricing or /auth.
 *  - Links leaving the site (socials, Calendly, directories, badges) get
 *    utm_source=outreign.io plus the section they were clicked in, so partners
 *    and our own profiles can see the traffic we send them.
 *  - Every outbound click is captured as `outbound_click` with the section
 *    label, so a "direct" visitor at least has a recorded journey.
 */
import { captureEvent } from "@/lib/analytics-events";
import { getAttributionProps } from "@/lib/attribution";

const OWN_HOSTS = [/(^|\.)outreign\.io$/, /(^|\.)outreign\.lovable\.app$/, /^localhost$/];

const isOwnHost = (host: string) =>
  OWN_HOSTS.some((re) => re.test(host)) || host === window.location.hostname;

/** Nearest section label, used as utm_content / event property. */
const sectionOf = (el: HTMLElement): string => {
  const labelled = el.closest<HTMLElement>("[data-utm-section]");
  if (labelled?.dataset.utmSection) return labelled.dataset.utmSection;

  const section = el.closest<HTMLElement>("section, footer, header, nav, dialog");
  if (!section) return "page";
  if (section.id) return slug(section.id);
  const aria = section.getAttribute("aria-label");
  if (aria) return slug(aria);
  // Unnamed sections: fall back to the heading a human would read, then to the
  // nearest identified ancestor, so utm_content is never just "section".
  const heading = section.querySelector<HTMLElement>("h1, h2, h3");
  if (heading?.textContent?.trim()) return slug(heading.textContent);
  const identified = section.closest<HTMLElement>("[id]");
  if (identified?.id) return slug(identified.id);
  return section.tagName.toLowerCase();
};

const slug = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);

const tagOutbound = (url: URL, section: string) => {
  if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "outreign.io");
  if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "referral");
  if (!url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", "site");
  if (!url.searchParams.has("utm_content")) url.searchParams.set("utm_content", section);
};

const carryAttribution = (url: URL) => {
  const attr = getAttributionProps();
  if (!attr.utm_source || attr.utm_source === "direct") return;
  if (!url.searchParams.has("utm_source")) {
    url.searchParams.set("utm_source", attr.utm_source);
    url.searchParams.set("utm_medium", attr.utm_medium || "referral");
    if (attr.utm_campaign) url.searchParams.set("utm_campaign", attr.utm_campaign);
  }
};

let installed = false;

export function initLinkTagging(): void {
  if (typeof document === "undefined" || installed) return;
  installed = true;

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;

      const raw = anchor.getAttribute("href") || "";
      if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(raw)) return;

      let url: URL;
      try {
        url = new URL(anchor.href);
      } catch {
        return;
      }
      if (!/^https?:$/.test(url.protocol)) return;

      const section = sectionOf(anchor);
      const own = isOwnHost(url.hostname);

      if (own) {
        // Only rewrite real navigations; react-router links are handled in-app
        // and rewriting them would fight the router.
        if (anchor.target === "_blank" || anchor.dataset.utmCarry === "true") {
          carryAttribution(url);
          anchor.href = url.toString();
        }
        return;
      }

      tagOutbound(url, section);
      anchor.href = url.toString();

      captureEvent("outbound_click", {
        section,
        destination_host: url.hostname,
        destination: url.toString().slice(0, 300),
        link_text: (anchor.textContent || anchor.getAttribute("aria-label") || "").trim().slice(0, 80),
      });
    },
    // Capture phase so the href is rewritten before the browser follows it.
    true,
  );
}
