/**
 * Fetch one public page and dial only the address that was just vetted.
 *
 * `fetch()` resolves the name again. A DNS answer that changes between that
 * check and the connect can point the socket at a private address. The socket
 * lookup below returns the vetted address and does not query DNS. The TLS
 * name, SNI, and certificate check stay on the hostname. A second lookup is
 * not what makes this safe.
 */

import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import { publicHttpUrl, resolvePublicHost, sameSiteHost } from "./safe-url.ts";

export interface PageFetch {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  html: string | null;
  ok: boolean;
  cacheState: "hit" | "miss" | "unknown";
}

export interface DialTarget {
  url: URL;
  address: string;
  signal: AbortSignal;
  headers: Record<string, string>;
}

export interface DialResult {
  status: number;
  headers: Headers;
  body: string;
}

type LookupFn = (
  hostname: string,
  options: unknown,
  callback?: (err: Error | null, address: unknown, family?: number) => void,
) => void;

/** The address passed to the socket. It does not call DNS. */
export function pinnedLookup(address: string): LookupFn {
  const family = address.includes(":") ? 6 : 4;
  return (_hostname, options, callback) => {
    const cb = typeof options === "function"
      ? options as (err: Error | null, address: unknown, family?: number) => void
      : callback;
    if (!cb) return;
    const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;
    if (all) cb(null, [{ address, family }]);
    else cb(null, address, family);
  };
}

function nodeDial(target: DialTarget): Promise<DialResult> {
  const mod = target.url.protocol === "https:" ? https : http;
  const port = target.url.port
    ? Number(target.url.port)
    : target.url.protocol === "https:" ? 443 : 80;
  return new Promise((resolve, reject) => {
    const req = mod.request({
      protocol: target.url.protocol,
      hostname: target.url.hostname,
      port,
      method: "GET",
      path: `${target.url.pathname}${target.url.search}`,
      headers: { ...target.headers, host: target.url.host },
      servername: target.url.hostname,
      lookup: pinnedLookup(target.address) as never,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (typeof value === "string") headers.set(key, value);
          else if (Array.isArray(value)) headers.set(key, value.join(", "));
        }
        resolve({
          status: res.statusCode ?? 0,
          headers,
          body: Buffer.concat(chunks).toString("utf8").slice(0, 4_000_000),
        });
      });
    });
    const abort = () => req.destroy(new Error("aborted"));
    if (target.signal.aborted) abort();
    else target.signal.addEventListener("abort", abort, { once: true });
    req.on("error", reject);
    req.end();
  });
}

async function systemLookup(host: string): Promise<string[]> {
  const found = await dnsLookup(host, { all: true, verbatim: true });
  return found.map((entry) => entry.address);
}

export interface PageDeps {
  lookup: (host: string) => Promise<string[]>;
  dial: (target: DialTarget) => Promise<DialResult>;
  timeoutMs: number;
  headers: Record<string, string>;
  /** html keeps a rendered page. text keeps robots.txt and sitemap XML. */
  accept: "html" | "text";
}

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
  Accept: "text/html",
};

function cacheStateOf(headers: Headers): PageFetch["cacheState"] {
  const value = `${headers.get("cf-cache-status") ?? ""} ${headers.get("x-cache") ?? ""}`;
  if (/hit/i.test(value)) return "hit";
  if (/miss/i.test(value)) return "miss";
  return "unknown";
}

/**
 * The page fetch research-lead uses.
 * `deps.dial` is the socket. Tests pass one that records the address.
 * Production dials with `pinnedLookup` and leaves certificate verification on.
 */
export async function fetchPinnedPage(raw: string, deps: Partial<PageDeps> = {}): Promise<PageFetch> {
  const lookup = deps.lookup ?? systemLookup;
  const dial = deps.dial ?? nodeDial;
  const timeoutMs = deps.timeoutMs ?? 9_000;
  const headers = deps.headers ?? DEFAULT_HEADERS;
  const accept = deps.accept ?? "html";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const failed = (status: number, finalUrl = raw): PageFetch => ({
    requestedUrl: raw, finalUrl, status, html: null, ok: false, cacheState: "unknown",
  });
  try {
    let current = publicHttpUrl(raw);
    if (!current.ok) return failed(0);
    const citedHost = new URL(current.href).hostname;
    for (let hop = 0; hop < 3; hop++) {
      const url = new URL(current.href);
      if (!sameSiteHost(url.hostname, citedHost)) return failed(0, current.href);
      const resolved = await resolvePublicHost(url.hostname, lookup);
      if (!resolved.ok) return failed(0, current.href);
      const res = await dial({ url, address: resolved.address, signal: controller.signal, headers });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return failed(res.status, current.href);
        const next = publicHttpUrl(new URL(location, current.href).href);
        if (!next.ok) return failed(res.status, current.href);
        if (!sameSiteHost(new URL(next.href).hostname, citedHost)) return failed(res.status, current.href);
        current = next;
        continue;
      }
      const cacheState = cacheStateOf(res.headers);
      const type = res.headers.get("content-type") || "";
      const htmlDocument = /^\s*<!doctype html/i.test(res.body) || /^\s*<html/i.test(res.body);
      const usable = accept === "text"
        ? res.status >= 200 && res.status < 300 && !htmlDocument
        : Boolean(res.status) && res.status < 400 && type.includes("html");
      if (!usable) {
        return { requestedUrl: raw, finalUrl: current.href, status: res.status, html: null, ok: false, cacheState };
      }
      return { requestedUrl: raw, finalUrl: current.href, status: res.status, html: res.body, ok: true, cacheState };
    }
    return failed(0);
  } catch {
    return failed(0);
  } finally {
    clearTimeout(timer);
  }
}
