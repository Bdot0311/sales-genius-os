/**
 * HeyCatch analytics.
 *
 * @heycatch/sdk is ~240 KB of source. It used to be a static import evaluated
 * at module scope in the main entry chunk, which put it on the critical path
 * before first paint. It is now imported lazily (after first paint, via
 * initHeycatch() from main.tsx) behind a facade that queues any calls made
 * before the SDK resolves.
 */
type AnyFn = (...args: unknown[]) => unknown;
type HeycatchLike = Record<string, AnyFn>;

let sdk: HeycatchLike | null = null;
let loading: Promise<HeycatchLike | null> | null = null;
const queue: Array<[string, unknown[]]> = [];

const flush = () => {
  if (!sdk) {
    queue.length = 0;
    return;
  }
  for (const [method, args] of queue.splice(0)) {
    try {
      (sdk[method] as AnyFn | undefined)?.(...args);
    } catch { /* analytics must never break the app */ }
  }
};

/** Download + init the SDK. Safe to call repeatedly. */
export const initHeycatch = async (): Promise<void> => {
  if (sdk) return;
  if (!loading) {
    loading = import("@heycatch/sdk")
      .then((mod) => {
        const a = mod.analytics as unknown as HeycatchLike;
        a.init({
          projectKey: "hck_pk_VgVASkSJkbBwJBEWh_CuEjUgEzDkKPNt",
          install: {
            framework: "vite-react",
            frameworkVersion: "19",
            agent: "lovable",
          },
        });
        return a;
      })
      .catch(() => null);
  }
  sdk = await loading;
  flush();
};

const call = (method: string) => (...args: unknown[]) => {
  if (sdk) {
    try {
      (sdk[method] as AnyFn | undefined)?.(...args);
    } catch { /* analytics must never break the app */ }
    return;
  }
  if (queue.length < 100) queue.push([method, args]);
  void initHeycatch();
};

/** Facade with the methods this app uses. */
export const analytics = {
  trackEvent: call("trackEvent"),
  setIdentity: call("setIdentity"),
  resetIdentity: call("resetIdentity"),
};
