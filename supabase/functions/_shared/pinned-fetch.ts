/**
 * Fetch one public page and dial only the address that was just vetted.
 *
 * `fetch()` resolves the name again. A DNS answer that changes between that
 * check and the connect can point the socket at a private address. The socket
 * lookup below returns the vetted address and does not query DNS. The TLS
 * name, SNI, and certificate check stay on the hostname. A second lookup is
 * not what makes this safe.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { blockedHost, publicHttpUrl, resolvePublicHost, sameSiteHost } from "./safe-url.ts";

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
  method?: string;
  body?: string;
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

const MAX_RESPONSE_BYTES = 4_000_000;

function concatBytes(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function indexOfCrlfCrlf(bytes: Uint8Array): number {
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10) return i;
  }
  return -1;
}

/** Decode an HTTP/1.1 chunked body. A truncated final chunk keeps what arrived. */
export function decodeChunked(bytes: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let total = 0;
  let at = 0;
  const latin = new TextDecoder("latin1");
  while (at < bytes.length) {
    let lineEnd = at;
    while (lineEnd + 1 < bytes.length && !(bytes[lineEnd] === 13 && bytes[lineEnd + 1] === 10)) lineEnd++;
    if (lineEnd + 1 >= bytes.length) break;
    const size = parseInt(latin.decode(bytes.subarray(at, lineEnd)).split(";")[0].trim(), 16);
    if (!Number.isFinite(size) || size <= 0) break;
    const from = lineEnd + 2;
    const chunk = bytes.subarray(from, Math.min(from + size, bytes.length));
    parts.push(chunk);
    total += chunk.length;
    at = from + size + 2;
  }
  return concatBytes(parts, total);
}

/** Parse a raw HTTP/1.1 response read to EOF. */
export function parseHttpResponse(raw: Uint8Array): DialResult {
  const split = indexOfCrlfCrlf(raw);
  if (split < 0) throw new Error("malformed_response");
  const head = new TextDecoder("latin1").decode(raw.subarray(0, split));
  const [statusLine, ...lines] = head.split("\r\n");
  const status = Number(statusLine.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/)?.[1] ?? 0);
  const headers = new Headers();
  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    try { headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim()); } catch { /* skip invalid header */ }
  }
  let body = raw.subarray(split + 4);
  if (/chunked/i.test(headers.get("transfer-encoding") ?? "")) body = decodeChunked(body);
  else {
    const length = Number(headers.get("content-length"));
    if (Number.isFinite(length) && length >= 0 && headers.has("content-length")) body = body.subarray(0, length);
  }
  return { status, headers, body: new TextDecoder("utf-8").decode(body).slice(0, MAX_RESPONSE_BYTES) };
}

/**
 * Dial the vetted address with Deno sockets.
 *
 * The TCP socket goes to the address that was checked. TLS then runs with the
 * hostname, so SNI and certificate verification still name the site. The
 * node:http custom-lookup path crashed the hosted edge runtime on every call,
 * which silently turned every direct page read and outside-source fetch into
 * a failure.
 */
interface SocketConn {
  read(buf: Uint8Array): Promise<number | null>;
  write(bytes: Uint8Array): Promise<number>;
  close(): void;
}
interface SocketApi {
  connect(opts: { hostname: string; port: number }): Promise<SocketConn>;
  startTls(conn: SocketConn, opts: { hostname: string }): Promise<SocketConn>;
}

async function denoDial(target: DialTarget): Promise<DialResult> {
  const sockets = (globalThis as unknown as { Deno: SocketApi }).Deno;
  const https = target.url.protocol === "https:";
  const port = target.url.port ? Number(target.url.port) : https ? 443 : 80;
  const hostname = target.url.hostname.replace(/^\[|\]$/g, "");
  if (target.signal.aborted) throw new Error("aborted");
  let conn: SocketConn = await sockets.connect({ hostname: target.address, port });
  const close = () => { try { conn.close(); } catch { /* already closed */ } };
  target.signal.addEventListener("abort", close, { once: true });
  try {
    if (https) conn = await sockets.startTls(conn, { hostname });
    const method = target.method ?? "GET";
    const headerLines: string[] = [];
    const sent = new Set<string>();
    for (const [key, value] of Object.entries(target.headers)) {
      if (/[\r\n]/.test(key) || /[\r\n]/.test(String(value))) continue;
      const lower = key.toLowerCase();
      if (["host", "connection", "content-length", "accept-encoding", "transfer-encoding"].includes(lower)) continue;
      sent.add(lower);
      headerLines.push(`${key}: ${value}`);
    }
    const bodyBytes = target.body != null ? new TextEncoder().encode(target.body) : null;
    const request = [
      `${method} ${target.url.pathname || "/"}${target.url.search} HTTP/1.1`,
      `Host: ${target.url.host}`,
      "Connection: close",
      "Accept-Encoding: identity",
      ...headerLines,
      ...(bodyBytes ? [`Content-Length: ${bodyBytes.length}`] : []),
      "",
      "",
    ].join("\r\n");
    const writeAll = async (bytes: Uint8Array) => {
      let off = 0;
      while (off < bytes.length) off += await conn.write(bytes.subarray(off));
    };
    await writeAll(new TextEncoder().encode(request));
    if (bodyBytes) await writeAll(bodyBytes);
    const parts: Uint8Array[] = [];
    let total = 0;
    const buf = new Uint8Array(64 * 1024);
    while (total < MAX_RESPONSE_BYTES) {
      const n = await conn.read(buf);
      if (n === null) break;
      parts.push(buf.slice(0, n));
      total += n;
    }
    if (target.signal.aborted && !total) throw new Error("aborted");
    return parseHttpResponse(concatBytes(parts, total));
  } finally {
    target.signal.removeEventListener("abort", close);
    close();
  }
}

async function systemLookup(host: string): Promise<string[]> {
  const found = await dnsLookup(host, { all: true, verbatim: true });
  return found.map((entry) => entry.address);
}

export interface VettedPost {
  blocked: boolean;
  status: number;
  body: string;
}

/** http(s) whose host is not a private literal. Userinfo is left on the URL. */
function postableUrl(raw: string): URL | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (blockedHost(url.hostname)) return null;
  return url;
}

export async function isVettedPublicUrl(
  raw: string,
  lookup: (host: string) => Promise<string[]> = systemLookup,
): Promise<boolean> {
  const url = postableUrl(raw);
  if (!url) return false;
  const resolved = await resolvePublicHost(url.hostname, lookup);
  return resolved.ok;
}

/**
 * POST a public URL and dial only the address just vetted.
 *
 * A DNS check followed by fetch() looks the name up again. The second answer
 * can be a private address. This refuses a private name or a private answer,
 * then connects to the address it accepted. A 3xx is returned as-is.
 */
export async function vettedPost(
  raw: string,
  init: {
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    lookup?: (host: string) => Promise<string[]>;
    dial?: (target: DialTarget) => Promise<DialResult>;
  } = {},
): Promise<VettedPost> {
  const lookup = init.lookup ?? systemLookup;
  const dial = init.dial ?? denoDial;
  const url = postableUrl(raw);
  if (!url) return { blocked: true, status: 0, body: "" };
  const resolved = await resolvePublicHost(url.hostname, lookup);
  if (!resolved.ok) return { blocked: true, status: 0, body: "" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15_000);
  try {
    const res = await dial({
      url,
      address: resolved.address,
      signal: controller.signal,
      headers: init.headers ?? {},
      method: "POST",
      body: init.body,
    });
    return { blocked: false, status: res.status, body: res.body.slice(0, 1000) };
  } finally {
    clearTimeout(timer);
  }
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
 * Production dials the vetted address with Deno sockets and verifies the certificate against the hostname.
 */
export async function fetchPinnedPage(raw: string, deps: Partial<PageDeps> = {}): Promise<PageFetch> {
  const lookup = deps.lookup ?? systemLookup;
  const dial = deps.dial ?? denoDial;
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
