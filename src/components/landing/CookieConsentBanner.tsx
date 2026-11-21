import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  acceptVisitorCookies,
  declineVisitorCookies,
  hasBrowserPrivacySignal,
  readCookieChoice,
  shouldShowCookieBanner,
  visitorSdkFrom,
  type VisitorSdk,
} from "@/lib/cookie-consent";

/**
 * First paint stays empty so the prerendered marketing HTML still matches
 * hydration. The choice is read after mount.
 */
export function CookieConsentBanner() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const nav = window.navigator as Navigator & { globalPrivacyControl?: boolean };
      setOpen(shouldShowCookieBanner({
        pathname,
        choice: readCookieChoice(window.localStorage),
        privacySignal: hasBrowserPrivacySignal({
          doNotTrack: nav.doNotTrack,
          globalPrivacyControl: nav.globalPrivacyControl === true,
        }),
      }));
    } catch {
      setOpen(false);
    }
  }, [pathname]);

  if (!open) return null;

  const choose = (choice: "accept" | "decline") => {
    const sdk: VisitorSdk | null = visitorSdkFrom(window as Window & { OutReign?: VisitorSdk });
    if (choice === "accept") acceptVisitorCookies({ storage: window.localStorage, sdk });
    else declineVisitorCookies({ storage: window.localStorage, sdk });
    setOpen(false);
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pt-4 sm:px-6"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <section
        aria-label="Cookie notice"
        className="pointer-events-auto relative mx-auto flex w-full max-w-3xl flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-card/95 p-4 shadow-card backdrop-blur-md sm:flex-row sm:items-center sm:gap-6 sm:p-5"
      >
        <div
          className="absolute inset-x-0 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, hsl(261 75% 60% / 0.6), transparent)" }}
          aria-hidden="true"
        />
        <p className="text-sm leading-relaxed text-foreground/85">
          We use cookies to understand which companies visit our site.{" "}
          <Link
            to="/privacy"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card rounded-sm"
          >
            Privacy
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-10 px-4" onClick={() => choose("decline")}>
            Decline
          </Button>
          <Button type="button" size="sm" className="min-h-10 px-4" onClick={() => choose("accept")}>
            Accept
          </Button>
        </div>
      </section>
    </div>
  );
}
