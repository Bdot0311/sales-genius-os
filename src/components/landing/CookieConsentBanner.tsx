import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { needsAnswer, onConsentChange, readChoice, saveChoices, type Choice, type Purpose } from "@/lib/consent";
import {
  acceptVisitorCookies,
  declineVisitorCookies,
  isAppRoute,
  readCookieChoice,
  visitorSdkFrom,
  type VisitorSdk,
} from "@/lib/cookie-consent";

const PURPOSES: Purpose[] = ["analytics", "advertising"];

function gpcOn(): boolean {
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/** Keeps the first-party visitor collector (v.js) in step with the analytics answer. */
function syncVisitorCollector(choice: Choice) {
  const sdk: VisitorSdk | null = visitorSdkFrom(window as Window & { OutReign?: VisitorSdk });
  if (choice === "granted") acceptVisitorCookies({ storage: window.localStorage, sdk });
  else declineVisitorCookies({ storage: window.localStorage, sdk });
}

/** One-time carry-over of the earlier single Accept/Decline answer to analytics. */
function migrateLegacyAnswer() {
  try {
    if (readChoice("analytics") !== null) return;
    const old = readCookieChoice(window.localStorage);
    if (old) saveChoices({ analytics: old === "accept" ? "granted" : "denied" });
  } catch { /* storage may be locked */ }
}

export function CookieConsentBanner() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<Record<Purpose, boolean>>({ analytics: false, advertising: false });
  const panelRef = useRef<HTMLElement>(null);
  const gpc = typeof navigator !== "undefined" && gpcOn();

  useEffect(() => {
    migrateLegacyAnswer();
    if (gpcOn()) syncVisitorCollector("denied");
  }, []);

  const check = useCallback(() => {
    if (isAppRoute(pathname)) return setOpen(false);
    void needsAnswer(PURPOSES).then(setOpen).catch(() => setOpen(false));
  }, [pathname]);

  useEffect(() => {
    check();
    return onConsentChange(check);
  }, [check]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const openSettings = () => {
      setDraft({ analytics: readChoice("analytics") === "granted", advertising: readChoice("advertising") === "granted" });
      setSettingsOpen(true);
    };
    window.addEventListener("open-cookie-settings", openSettings);
    return () => window.removeEventListener("open-cookie-settings", openSettings);
  }, []);

  const save = (choices: Record<Purpose, Choice>) => {
    saveChoices(choices);
    syncVisitorCollector(gpcOn() ? "denied" : choices.analytics);
    setOpen(false);
    setSettingsOpen(false);
  };
  const all = (choice: Choice) => save({ analytics: choice, advertising: choice });

  const openSettingsFromBanner = () => window.dispatchEvent(new Event("open-cookie-settings"));

  return (
    <>
      {open && !settingsOpen ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pt-4 sm:px-6"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <section
            ref={panelRef}
            tabIndex={-1}
            aria-label="Cookie choices"
            className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur focus:outline-none sm:p-5"
          >
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Your privacy choices</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                We count visits without cookies. If you accept, we also use cookies to measure clicks and other actions
                and to understand which companies visit our site.{" "}
                <Link to="/privacy" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
                  Privacy policy
                </Link>
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="ghost" size="sm" className="min-h-10 sm:mr-auto" onClick={openSettingsFromBanner}>
                Cookie settings
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" className="min-h-10 px-5" onClick={() => all("denied")}>
                  Reject all
                </Button>
                <Button type="button" variant="outline" size="sm" className="min-h-10 px-5" onClick={() => all("granted")}>
                  Accept all
                </Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cookie settings</DialogTitle>
            <DialogDescription>
              Choose what we may use. You can change this anytime from "Cookie settings" in the footer.
            </DialogDescription>
          </DialogHeader>
          {gpc ? (
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Your browser's privacy signal (Global Privacy Control) is on, so analytics and advertising stay off.
            </p>
          ) : null}
          <div className="divide-y divide-border rounded-lg border border-border">
            <div className="flex items-start justify-between gap-4 p-4">
              <div>
                <p className="text-sm font-medium text-foreground">Necessary</p>
                <p className="text-sm text-muted-foreground">Keeps the site working, signed in and secure. Always on.</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">Always on</span>
            </div>
            {([
              ["analytics", "Analytics", "Measures visits, clicks and how the site performs. Provided by Lovable, Google, PostHog, Ahrefs, Opinly and Firebase."],
              ["advertising", "Advertising and visitor insights", "Ad measurement and identifying which companies visit. Provided by Google, GetLeads, RB2B and HeyCatch."],
            ] as const).map(([key, label, desc]) => (
              <div key={key} className="flex items-start justify-between gap-4 p-4">
                <div>
                  <label htmlFor={`consent-${key}`} className="text-sm font-medium text-foreground">{label}</label>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  id={`consent-${key}`}
                  checked={!gpc && draft[key]}
                  disabled={gpc}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => save({
                analytics: draft.analytics ? "granted" : "denied",
                advertising: draft.advertising ? "granted" : "denied",
              })}
            >
              Save choices
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
