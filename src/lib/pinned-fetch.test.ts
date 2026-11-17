import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import https from "node:https";
import { describe, expect, it } from "vitest";
import { fetchPinnedPage, isVettedPublicUrl, pinnedLookup, vettedPost, type DialResult, type DialTarget } from "../../supabase/functions/_shared/pinned-fetch";

const RESEARCH = readFileSync("supabase/functions/research-lead/index.ts", "utf8");
const TRIGGER = readFileSync("supabase/functions/trigger-webhook/index.ts", "utf8");
const PUBLIC = "93.184.216.34";
const PRIVATE = "127.0.0.1";

function html(body: string): DialResult {
  return {
    status: 200,
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    body,
  };
}

describe("fetchPinnedPage dials the address it already vetted", () => {
  it("does not dial the private address a later lookup returns", async () => {
    let calls = 0;
    const dialed: string[] = [];
    const page = await fetchPinnedPage("https://tf.example/about", {
      lookup: async () => {
        calls += 1;
        return calls === 1 ? [PUBLIC] : [PRIVATE];
      },
      dial: async (target: DialTarget) => {
        dialed.push(target.address);
        let socket: unknown;
        pinnedLookup(target.address)(target.url.hostname, { all: true }, (_err, value) => {
          socket = value;
        });
        expect(socket).toEqual([{ address: PUBLIC, family: 4 }]);
        expect(target.url.hostname).toBe("tf.example");
        return html("<html><p>TF Business Solutions hires freight brokers for shippers across the region.</p></html>");
      },
    });
    expect(dialed).toEqual([PUBLIC]);
    expect(dialed).not.toContain(PRIVATE);
    expect(page.ok).toBe(true);
    expect(page.html).toContain("hires freight brokers");
    expect(page.finalUrl).toBe("https://tf.example/about");
  });

  it("does not dial when the vetted answer is private", async () => {
    const dialed: string[] = [];
    const page = await fetchPinnedPage("https://127.0.0.1.nip.io/admin", {
      lookup: async () => [PRIVATE],
      dial: async (target) => {
        dialed.push(target.address);
        return html("<html>no</html>");
      },
    });
    expect(dialed).toEqual([]);
    expect(page.ok).toBe(false);
    expect(page.html).toBeNull();
  });

  it("checks the next hop and will not follow it onto a private address", async () => {
    const dialed: string[] = [];
    const page = await fetchPinnedPage("https://tf.example/", {
      lookup: async (host) => (host === "tf.example" ? [PUBLIC] : [PRIVATE]),
      dial: async (target) => {
        dialed.push(`${target.address} ${target.url.hostname}`);
        return {
          status: 302,
          headers: new Headers({ location: "https://evil.example/secret" }),
          body: "",
        };
      },
    });
    expect(dialed).toEqual([`${PUBLIC} tf.example`]);
    expect(page.ok).toBe(false);
  });

  it("dials the second public address of a same-site redirect", async () => {
    const dialed: string[] = [];
    let calls = 0;
    const page = await fetchPinnedPage("https://tf.example/", {
      lookup: async () => {
        calls += 1;
        if (calls === 1) return [PUBLIC];
        if (calls === 2) return ["93.184.216.35"];
        return [PRIVATE];
      },
      dial: async (target) => {
        dialed.push(target.address);
        if (target.address === PUBLIC) {
          return { status: 302, headers: new Headers({ location: "https://www.tf.example/about" }), body: "" };
        }
        return html("<html><p>same site</p></html>");
      },
    });
    expect(dialed).toEqual([PUBLIC, "93.184.216.35"]);
    expect(page.ok).toBe(true);
    expect(page.finalUrl).toBe("https://www.tf.example/about");
  });

  it("the production dial connects to the vetted address and verifies TLS for the hostname", async () => {
    const g = globalThis as unknown as { Deno?: unknown };
    const original = g.Deno;
    let dialed = "";
    let tlsName = "";
    let request = "";
    const reply = new TextEncoder().encode(
      "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n" +
      "8\r\n<html><p\r\nf\r\n>pinned</p></ht\r\n3\r\nml>\r\n0\r\n\r\n",
    );
    let sent = false;
    const conn = {
      write: async (bytes: Uint8Array) => { request += new TextDecoder().decode(bytes); return bytes.length; },
      read: async (buf: Uint8Array) => {
        if (sent) return null;
        sent = true;
        buf.set(reply);
        return reply.length;
      },
      close: () => {},
    };
    g.Deno = {
      connect: async (opts: { hostname: string }) => { dialed = opts.hostname; return conn; },
      startTls: async (_c: unknown, opts: { hostname: string }) => { tlsName = opts.hostname; return conn; },
    };
    try {
      let calls = 0;
      const page = await fetchPinnedPage("https://tf.example/about", {
        lookup: async () => {
          calls += 1;
          return calls === 1 ? [PUBLIC] : [PRIVATE];
        },
      });
      expect(page.ok).toBe(true);
      expect(page.html).toBe("<html><p>pinned</p></html>");
      expect(dialed).toBe(PUBLIC);
      expect(tlsName).toBe("tf.example");
      expect(request).toContain("Host: tf.example\r\n");
      expect(request.startsWith("GET /about HTTP/1.1\r\n")).toBe(true);
    } finally {
      g.Deno = original;
    }
  });

  it("the socket lookup returns one address and does not take a family from DNS", () => {
    let single: unknown;
    pinnedLookup(PUBLIC)("tf.example", {}, (_err, address, family) => {
      single = { address, family };
    });
    expect(single).toEqual({ address: PUBLIC, family: 4 });
  });

  it("research-lead fetches pages through this path", () => {
    expect(RESEARCH).toContain("fetchPinnedPage");
    expect(RESEARCH).not.toContain('redirect: "manual"');
  });
});

describe("a webhook post dials the address it already vetted", () => {
  it("does not post when the name answers with a private address", async () => {
    const dialed: string[] = [];
    const result = await vettedPost("https://hooks.example/in", {
      body: "{\"event\":\"lead\"}",
      lookup: async () => [PRIVATE],
      dial: async (target) => {
        dialed.push(target.address);
        return { status: 200, headers: new Headers(), body: "ok" };
      },
    });
    expect(dialed).toEqual([]);
    expect(result.blocked).toBe(true);
  });

  it("posts to the public address from the check, including when a later lookup is private", async () => {
    let calls = 0;
    const dialed: string[] = [];
    const result = await vettedPost("https://hooks.example/in", {
      body: "{\"event\":\"lead\"}",
      lookup: async () => {
        calls += 1;
        return calls === 1 ? [PUBLIC] : [PRIVATE];
      },
      dial: async (target) => {
        dialed.push(`${target.method} ${target.address} ${target.body}`);
        return { status: 302, headers: new Headers({ location: "http://127.0.0.1/" }), body: "" };
      },
    });
    expect(dialed).toEqual([`POST ${PUBLIC} {\"event\":\"lead\"}`]);
    expect(result.blocked).toBe(false);
    expect(result.status).toBe(302);
  });

  it("refuses a link-local literal before any lookup", async () => {
    let lookups = 0;
    const open = await isVettedPublicUrl("http://[fe9b::1]/hook", async () => {
      lookups += 1;
      return [PUBLIC];
    });
    expect(open).toBe(false);
    expect(lookups).toBe(0);
  });

  it("trigger-webhook posts through this path", () => {
    expect(TRIGGER).toContain("isVettedPublicUrl");
    expect(TRIGGER).toContain("vettedPost");
    expect(TRIGGER).not.toContain("Deno.resolveDns");
    expect(TRIGGER).not.toContain('redirect: "manual"');
  });
});
