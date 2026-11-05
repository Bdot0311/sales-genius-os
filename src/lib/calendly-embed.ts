/*
 * Calendly's inline embed, loaded on demand.
 *
 * Inline rather than a link out, because the application form and the booking
 * are one act. Sending someone to calendly.com mid-flow loses the ones who
 * close the tab, and it also loses the thread: a booking made on a separate
 * site arrives with no idea which application it belongs to.
 *
 * The join is `utmContent`. `calendly-webhook` already reads
 * `tracking.utm_content` off the invitee payload and looks the request row up
 * by it, so passing the row id here is what makes a booking arrive already
 * attached to the answers that preceded it.
 *
 * Loaded only when someone reaches the booking step. Calendly's bundle is not
 * small and most visitors to a pricing page never get there.
 */

export const CALENDLY_SCRIPT_SRC = "https://assets.calendly.com/assets/external/widget.js";
export const CALENDLY_STYLE_HREF = "https://assets.calendly.com/assets/external/widget.css";

/** How long to wait for Calendly's bundle before giving up on it. */
export const CALENDLY_LOAD_TIMEOUT_MS = 10000;

export interface CalendlyApi {
  initInlineWidget(options: {
    url: string;
    parentElement: HTMLElement;
    prefill?: { name?: string; email?: string };
    utm?: { utmContent?: string; utmSource?: string };
  }): void;
}

interface CalendlyWindow {
  Calendly?: CalendlyApi;
  document?: Document;
}

let inFlight: Promise<CalendlyApi | null> | null = null;

/** Drops the memoised load. Tests call this; nothing in the app does. */
export function resetCalendlyLoader(): void {
  inFlight = null;
}

export interface LoadOptions {
  /** Injected in tests. Defaults to the real window. */
  win?: CalendlyWindow;
  timeoutMs?: number;
}

/**
 * Resolve Calendly's embed API, or null if it cannot be had.
 *
 * Never rejects. A blocked script leaves the caller to offer the plain link
 * instead, which is strictly better than an empty box and a console error.
 */
export function loadCalendly(options: LoadOptions = {}): Promise<CalendlyApi | null> {
  const win = options.win ?? (typeof window !== "undefined" ? (window as unknown as CalendlyWindow) : undefined);
  if (!win || !win.document) return Promise.resolve(null);

  if (win.Calendly) return Promise.resolve(win.Calendly);
  if (inFlight) return inFlight;

  const promise = new Promise<CalendlyApi | null>((resolve) => {
    const doc = win.document as Document;
    let settled = false;
    const finish = (value: CalendlyApi | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), options.timeoutMs ?? CALENDLY_LOAD_TIMEOUT_MS);

    // The stylesheet is cosmetic: it styles the container and the spinner, not
    // the booking iframe. Appended without being waited on, so a blocked
    // stylesheet cannot stop a working widget from rendering.
    if (!doc.querySelector(`link[href="${CALENDLY_STYLE_HREF}"]`)) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = CALENDLY_STYLE_HREF;
      (doc.head ?? doc.body)?.appendChild(link);
    }

    const existing = doc.querySelector(`script[src="${CALENDLY_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
    const script = existing ?? doc.createElement("script");
    script.addEventListener("load", () => {
      clearTimeout(timer);
      finish(win.Calendly ?? null);
    });
    script.addEventListener("error", () => {
      clearTimeout(timer);
      finish(null);
    });
    if (!existing) {
      script.src = CALENDLY_SCRIPT_SRC;
      script.async = true;
      (doc.head ?? doc.body)?.appendChild(script);
    }
  });

  inFlight = promise;
  return promise;
}
