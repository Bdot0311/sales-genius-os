/*
 * Google sign-in with no authorization code and no client secret.
 *
 * Two things were wrong with the redirect flow, and they share a cause.
 *
 * The visible one: Google's account chooser said "to continue to
 * ghgfjnepvxvxrncmskys.supabase.co". That host is not a branding setting —
 * it is where the redirect flow sends the browser, so Google names it. No
 * value in this repository changes it.
 *
 * The breaking one: "Unable to exchange external code: 4/0A...". Google had
 * already issued that code, so it accepted the client id and the redirect
 * URI. The failure is the step after, where the auth server trades the code
 * for tokens using the client SECRET it holds — a copy kept in the auth
 * provider's own configuration, which is not the same store as the edge
 * functions' GOOGLE_CLIENT_SECRET and does not change when that one is
 * rotated.
 *
 * Google Identity Services removes both. The account chooser is opened by
 * this origin, so it says outreign.io, and it hands back a signed ID token
 * directly in the browser. There is no code to exchange and no secret
 * involved, so the step that is failing stops existing.
 *
 * It does not replace the Gmail connection. That still needs the redirect
 * flow with mailbox scopes and a refresh token. This is identity only.
 *
 * Everything here degrades to nothing: when the script is blocked, slow, or
 * absent, the loader resolves null and the caller keeps the flow that shipped
 * before. The worst case is the behaviour of yesterday, never less.
 */

export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ||
  "1077235865225-cheefmhijcepqc454s401n12ch8i2khh.apps.googleusercontent.com";

export const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** How long to wait for Google's script before giving up on it. */
export const GIS_LOAD_TIMEOUT_MS = 6000;

export interface GoogleCredentialResponse {
  credential?: string;
}

export interface GoogleIdentityApi {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect?(): void;
}

interface GoogleIdentityWindow {
  google?: { accounts?: { id?: GoogleIdentityApi } };
  document?: Document;
}

/**
 * A Google OAuth web client id, shaped.
 *
 * Checked because the fallback constant can be overridden by an environment
 * variable, and an empty or half-pasted override must not reach `initialize`,
 * where Google answers with a console error and a button that does nothing.
 */
export function looksLikeGoogleClientId(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(value.trim());
}

let inFlight: Promise<GoogleIdentityApi | null> | null = null;

/** Drops the memoised load. Tests call this; nothing in the app does. */
export function resetGoogleIdentityLoader(): void {
  inFlight = null;
}

export interface LoadOptions {
  /** Injected in tests. Defaults to the real window. */
  win?: GoogleIdentityWindow;
  timeoutMs?: number;
}

/**
 * Resolve Google's identity API, or null if it cannot be had.
 *
 * Never rejects. A sign-in page is the wrong place to surface a third party's
 * loading problem, and the caller has a working flow to fall back to.
 */
export function loadGoogleIdentity(options: LoadOptions = {}): Promise<GoogleIdentityApi | null> {
  const win = options.win ?? (typeof window !== "undefined" ? (window as unknown as GoogleIdentityWindow) : undefined);
  if (!win || !win.document) return Promise.resolve(null);

  const already = win.google?.accounts?.id;
  if (already) return Promise.resolve(already);

  if (inFlight) return inFlight;

  const promise = new Promise<GoogleIdentityApi | null>((resolve) => {
    const doc = win.document as Document;
    let settled = false;
    const finish = (value: GoogleIdentityApi | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), options.timeoutMs ?? GIS_LOAD_TIMEOUT_MS);

    const onLoad = () => {
      clearTimeout(timer);
      // The script sets window.google on load. If it somehow did not, null is
      // still the right answer: the caller keeps the redirect flow.
      finish(win.google?.accounts?.id ?? null);
    };
    const onError = () => {
      clearTimeout(timer);
      finish(null);
    };

    // Reuse a tag another mount already added, rather than loading Google's
    // script once per render of the sign-in form.
    const existing = doc.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`) as HTMLScriptElement | null;
    const script = existing ?? doc.createElement("script");
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) {
      script.src = GIS_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      (doc.head ?? doc.body)?.appendChild(script);
    }
  });

  inFlight = promise;
  return promise;
}
