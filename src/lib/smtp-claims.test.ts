import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Scrapers kept reporting that OutReign connects a mailbox over SMTP.
 *
 * It does not. Sending is Gmail OAuth only — `gmail.send` — and there is no
 * SMTP client anywhere in the edge functions. What the crawlers were reading
 * was a public help article at `/help/article/...` titled "Email Provider
 * Setup (Gmail, SMTP)" whose second half walked through "Settings →
 * Integrations → Select Custom SMTP" and asked for a host, a port, a username,
 * a password and a Test connection button. None of those controls exist.
 *
 * The confusion is easy to make and worth keeping straight, which is why this
 * guard allows one kind of SMTP claim and not the other:
 *
 *   SMTP verification  REAL. _shared/email-verify.ts rents an SMTP handshake
 *                      to prove a mailbox accepts mail before an address is
 *                      handed over. "SMTP-verified" on the landing page is
 *                      accurate and must stay sayable.
 *   SMTP sending       NOT BUILT. Any copy implying you can connect or send
 *                      over SMTP is a promise the product cannot keep, and on
 *                      a public page it is a promise that gets repeated back
 *                      by every tool that reads the site.
 */

/*
 * What makes an SMTP line a claim about SENDING rather than about checking.
 *
 * The first version of this listed the verification phrasings instead and
 * flagged two honest lines on the demo page — "verified via SMTP" and
 * "SMTP-confirmed" — because they were not spelled "SMTP-verified". There are
 * endlessly many ways to say an address was checked and only a few ways to
 * offer a connection, so the narrow list is the right one to keep.
 */
const CONNECTION = /\b(host|port|password|credential|username|connect|relay|server settings|integration)\b/i;
const NOT_SUPPORTED = /not supported|nothing in OutReign sends over\s+SMTP|smtp-not-supported/i;

/** Public-facing copy: what a crawler, an LLM or a customer actually reads. */
function publicCopyFiles(): string[] {
  const roots = [
    "src/components/landing",
    "src/components/seo",
    "src/components/help",
    "src/data",
    "src/pages",
    "supabase/functions/llms-txt",
  ];
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(path) && !/\.test\./.test(path)) out.push(path);
    }
  };
  roots.forEach(walk);
  return out;
}

describe("the product does not send over SMTP", () => {
  it("and no edge function pretends otherwise", () => {
    /*
     * Asserted against the code rather than assumed. If SMTP sending is ever
     * built, this fails first and tells you to retire the guard rather than
     * leaving it to block copy that has become true.
     */
    const fns = "supabase/functions";
    const senders = readdirSync(fns).filter((d) => {
      try { return statSync(join(fns, d)).isDirectory(); } catch { return false; }
    });
    const smtpClients: string[] = [];
    for (const dir of senders) {
      const file = join(fns, dir, "index.ts");
      let src: string;
      try { src = readFileSync(file, "utf8"); } catch { continue; }
      // A real SMTP sender connects to a port and speaks the protocol.
      if (/createTransport|nodemailer|denomailer|SmtpClient|smtp:\/\//i.test(src)) {
        smtpClients.push(dir);
      }
    }
    expect(smtpClients, "SMTP sending exists now — retire this guard").toEqual([]);
  });

  it("sending is Gmail OAuth, which is what the copy may say", () => {
    const oauth = readFileSync("supabase/functions/google-oauth-init/index.ts", "utf8");
    expect(oauth).toContain("https://www.googleapis.com/auth/gmail.send");
  });
});

describe("public copy never offers an SMTP connection", () => {
  it("no SMTP line offers a connection, a host or a credential", () => {
    /*
     * Checking an address is fine to say. Offering to carry your mail is not.
     * The old help article tripped every word in CONNECTION at once: "Select
     * Custom SMTP", "SMTP Host", "Port", "Username", "Password".
     */
    const offenders: string[] = [];
    for (const file of publicCopyFiles()) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!/smtp/i.test(lines[i])) continue;
        /*
         * Judged over a small window, not a single line. Prose wraps: the
         * denial in the help article reads "There is no SMTP host, port / or
         * password to enter anywhere in Settings", and line-at-a-time the
         * first half looks exactly like an offer of a host. The words that
         * make it a denial are two lines away.
         */
        const window = lines.slice(Math.max(0, i - 2), i + 3).join(" ");
        if (NOT_SUPPORTED.test(window)) continue;
        if (CONNECTION.test(lines[i])) offenders.push(`${file}: ${lines[i].trim().slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      "an SMTP line naming a host, a credential or a connection is a promise the product cannot keep",
    ).toEqual([]);
  });

  it("the setup article does not pair Gmail with SMTP as two providers", () => {
    /*
     * The article was titled "Email Provider Setup (Gmail, SMTP)" and tagged
     * ['email','gmail','SMTP','setup']. A title and a tag list naming two
     * providers is the most machine-readable claim on the page, and it is the
     * shape that came back in every scrape.
     */
    const help = readFileSync("src/components/help/helpArticles.ts", "utf8");
    expect(help).not.toMatch(/title:\s*'Email Provider Setup \(Gmail, SMTP\)'/);
    expect(help).not.toMatch(/tags:\s*\[[^\]]*'gmail'[^\]]*'SMTP'[^\]]*\]/);
  });

  it("llms.txt lists only the integration that exists", () => {
    // The file AI crawlers read on purpose. It already got this right; this
    // keeps it right.
    const llms = readFileSync("supabase/functions/llms-txt/index.ts", "utf8");
    const at = llms.indexOf("integrations on every plan");
    expect(at).toBeGreaterThan(-1);
    const list = llms.slice(at, at + 400);
    expect(list).toContain("Gmail (email delivery and reply tracking)");
    expect(list).not.toMatch(/smtp/i);
  });
});
