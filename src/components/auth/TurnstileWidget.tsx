import { useEffect, useRef } from "react";

// Cloudflare Turnstile site key. Public by design — it is rendered into the
// page and is useless without the secret key held server-side.
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as any).turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile script failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile script failed"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  /** Bump this value to force the challenge to reset (e.g. after a failed signup). */
  resetKey?: number;
}

export const TurnstileWidget = ({ onVerify, onExpire, resetKey = 0 }: TurnstileWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const turnstile = (window as any).turnstile;
        if (!turnstile) return;
        widgetId.current = turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: "dark",
          callback: (token: string) => onVerifyRef.current(token),
          "expired-callback": () => onExpireRef.current?.(),
          "error-callback": () => onExpireRef.current?.(),
        });
      })
      .catch((err) => {
        // Script blocked or offline: the server verifier fails open, so signup
        // still works rather than dead-ending the user.
        console.warn("Turnstile unavailable:", err);
      });

    return () => {
      cancelled = true;
      const turnstile = (window as any).turnstile;
      if (turnstile && widgetId.current) {
        try {
          turnstile.remove(widgetId.current);
        } catch {
          /* widget already gone */
        }
        widgetId.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!resetKey) return;
    const turnstile = (window as any).turnstile;
    if (turnstile && widgetId.current) {
      try {
        turnstile.reset(widgetId.current);
      } catch {
        /* ignore */
      }
    }
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;

  return <div ref={containerRef} className="flex justify-center" />;
};
