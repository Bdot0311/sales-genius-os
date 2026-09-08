import { describe, expect, it, vi } from "vitest";
import { coalesce, requestKey } from "./in-flight";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe("requestKey", () => {
  it("gives the same key regardless of the order the body was built in", () => {
    expect(requestKey({ job_title: "Founder", country: "US" })).toBe(
      requestKey({ country: "US", job_title: "Founder" }),
    );
  });

  it("sorts nested objects too", () => {
    expect(requestKey({ companies: [{ name: "Acme", domain: "acme.com" }] })).toBe(
      requestKey({ companies: [{ domain: "acme.com", name: "Acme" }] }),
    );
  });

  it("treats an absent key and an undefined one as the same request", () => {
    expect(requestKey({ job_title: "Founder" })).toBe(
      requestKey({ job_title: "Founder", industry: undefined }),
    );
  });

  it("keeps array order, which is part of the request", () => {
    expect(requestKey({ job_titles: ["CEO", "CTO"] })).not.toBe(
      requestKey({ job_titles: ["CTO", "CEO"] }),
    );
  });

  it("separates requests that differ", () => {
    expect(requestKey({ page: 1 })).not.toBe(requestKey({ page: 2 }));
  });
});

describe("coalesce", () => {
  it("runs the work once when two callers ask at the same time", async () => {
    const pending = new Map<string, Promise<string>>();
    const gate = deferred<void>();
    const work = vi.fn(async () => {
      await gate.promise;
      return "leads";
    });

    const first = coalesce(pending, "k", work);
    const second = coalesce(pending, "k", work);
    gate.resolve();

    expect(await first).toBe("leads");
    expect(await second).toBe("leads");
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("dedupes a caller that arrives in the same tick, before any await", async () => {
    // The case the disabled button cannot catch: two dispatches with no render
    // in between.
    const pending = new Map<string, Promise<number>>();
    const work = vi.fn(async () => 1);

    const both = [coalesce(pending, "k", work), coalesce(pending, "k", work)];
    await Promise.all(both);

    expect(work).toHaveBeenCalledTimes(1);
  });

  it("keeps different requests apart", async () => {
    const pending = new Map<string, Promise<string>>();
    const work = vi.fn(async () => "x");

    await Promise.all([
      coalesce(pending, "a", work),
      coalesce(pending, "b", work),
    ]);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("runs again once the first one has finished — this is not a cache", async () => {
    const pending = new Map<string, Promise<string>>();
    const work = vi.fn(async () => "x");

    await coalesce(pending, "k", work);
    await coalesce(pending, "k", work);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it("shares a failure with everyone who joined, and forgets it", async () => {
    const pending = new Map<string, Promise<string>>();
    const gate = deferred<string>();
    const failing = vi.fn(() => gate.promise);

    const first = coalesce(pending, "k", failing);
    const second = coalesce(pending, "k", failing);
    gate.reject(new Error("provider down"));

    await expect(first).rejects.toThrow("provider down");
    await expect(second).rejects.toThrow("provider down");

    // A failed search must be retryable — a stuck entry would make the button
    // dead until reload.
    const ok = vi.fn(async () => "recovered");
    expect(await coalesce(pending, "k", ok)).toBe("recovered");
  });

  it("leaves nothing behind, so the map cannot grow without bound", async () => {
    const pending = new Map<string, Promise<string>>();
    await coalesce(pending, "k", async () => "x");
    await coalesce(pending, "j", async () => "y").catch(() => {});
    expect(pending.size).toBe(0);
  });

  it("survives work that throws synchronously", async () => {
    const pending = new Map<string, Promise<string>>();
    const boom = () => {
      throw new Error("built a bad body");
    };

    await expect(coalesce(pending, "k", boom as () => Promise<string>)).rejects.toThrow(
      "built a bad body",
    );
    expect(pending.size).toBe(0);
  });
});
