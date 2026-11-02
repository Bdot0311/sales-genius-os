import { describe, expect, it } from "vitest";
import {
  SmtpError,
  chooseAuth,
  prepareData,
  sendMail,
  terminatedReply,
  type SmtpConnection,
  type SmtpTransport,
} from "../../supabase/functions/_shared/smtp-client.ts";

/**
 * `send-email` had one transport, the Gmail API, and answered "Unsupported
 * email provider" to everything else — so a mailbox that hands back a password
 * instead of an OAuth token could not be sent from at all.
 *
 * These drive the conversation against a scripted server rather than a socket,
 * because the parts that break are not "does it connect": they are multiline
 * replies, a body line that is a single dot, and whether a refusal is worth
 * retrying.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** A server that replies from a script and records what it was told. */
function fakeServer(script: string[]) {
  const pending = [...script];
  const written: string[] = [];
  let outbox = "";
  let closed = false;
  let upgrades = 0;

  const push = () => {
    const next = pending.shift();
    if (next !== undefined) outbox += next;
  };
  push(); // the greeting arrives unprompted

  const conn: SmtpConnection = {
    async read(p) {
      if (!outbox.length) return null;
      const bytes = enc.encode(outbox);
      const n = Math.min(bytes.length, p.length);
      p.set(bytes.subarray(0, n));
      outbox = dec.decode(bytes.subarray(n));
      return n;
    },
    async write(p) {
      const text = dec.decode(p);
      written.push(text);
      // Every client line gets the next scripted reply, except the message
      // body, which is part of the DATA command already in flight.
      if (!text.startsWith("From:") && !text.includes("\r\n.\r\n")) push();
      else push();
      return p.length;
    },
    close() {
      closed = true;
    },
  };

  const transport: SmtpTransport = {
    async connect() {
      return conn;
    },
    async upgrade(c) {
      upgrades++;
      return c;
    },
  };

  return {
    transport,
    written,
    sent: () => written.join(""),
    get closed() {
      return closed;
    },
    get upgrades() {
      return upgrades;
    },
  };
}

/**
 * The SmtpError a call rejected with.
 *
 * Catching and casting the error types cleanly and asserts nothing: if the
 * call RESOLVED, the resolved value flows into the assertions below and a test
 * about a failure quietly starts testing a success instead.
 */
async function rejection(p: Promise<unknown>): Promise<SmtpError> {
  try {
    await p;
  } catch (e) {
    expect(e, "expected an SmtpError").toBeInstanceOf(SmtpError);
    return e as SmtpError;
  }
  throw new Error("expected the call to reject, but it resolved");
}

const ACCOUNT = { hostname: "smtp.example.com", port: 587, username: "a@b.com", password: "pw" };
const MESSAGE = { from: "a@b.com", to: "lead@acme.com", raw: "Subject: Hi\r\n\r\nHello there" };

/** A healthy 587 conversation: greeting, EHLO, STARTTLS, EHLO, AUTH, envelope, DATA. */
const HAPPY = [
  "220 smtp.example.com ESMTP\r\n",
  "250-smtp.example.com\r\n250-STARTTLS\r\n250 AUTH LOGIN PLAIN\r\n",
  "220 Go ahead\r\n",
  "250-smtp.example.com\r\n250 AUTH LOGIN PLAIN\r\n",
  "235 Authenticated\r\n",
  "250 Sender ok\r\n",
  "250 Recipient ok\r\n",
  "354 End data with <CRLF>.<CRLF>\r\n",
  "250 2.0.0 Ok: queued as ABC123\r\n",
  "221 Bye\r\n",
];

describe("a complete submission", () => {
  it("walks the whole conversation and reports the queue id", async () => {
    const server = fakeServer(HAPPY);
    const { reply } = await sendMail(server.transport, ACCOUNT, MESSAGE);
    expect(reply).toContain("queued as ABC123");
    const sent = server.sent();
    expect(sent).toContain("EHLO ");
    expect(sent).toContain("STARTTLS");
    expect(sent).toContain("MAIL FROM:<a@b.com>");
    expect(sent).toContain("RCPT TO:<lead@acme.com>");
    expect(sent).toContain("DATA");
    expect(sent).toContain("QUIT");
    expect(server.closed, "the socket must be closed").toBe(true);
  });

  it("upgrades to TLS and says EHLO again afterwards", async () => {
    /*
     * The second EHLO is not politeness. Servers commonly withhold AUTH until
     * the connection is secure, so the capability list read before STARTTLS is
     * the wrong one to pick a mechanism from.
     */
    const server = fakeServer(HAPPY);
    await sendMail(server.transport, ACCOUNT, MESSAGE);
    expect(server.upgrades).toBe(1);
    expect(server.written.filter((w) => w.startsWith("EHLO"))).toHaveLength(2);
  });

  it("sends the password only after the upgrade", async () => {
    const server = fakeServer(HAPPY);
    await sendMail(server.transport, ACCOUNT, MESSAGE);
    const order = server.written.map((w) => w.trim());
    const tls = order.findIndex((w) => w === "STARTTLS");
    const auth = order.findIndex((w) => w.startsWith("AUTH"));
    expect(tls).toBeGreaterThan(-1);
    expect(auth, "credentials must not precede STARTTLS").toBeGreaterThan(tls);
  });
});

describe("replies that arrive in more than one line", () => {
  it("reads to the terminator, not to the first newline", () => {
    const buf = "250-smtp.example.com\r\n250-STARTTLS\r\n250 AUTH LOGIN\r\n";
    const r = terminatedReply(buf);
    expect(r?.reply.code).toBe(250);
    expect(r?.reply.lines).toHaveLength(3);
    expect(r?.consumed).toBe(buf.length);
  });

  it("waits when the reply is still incomplete", () => {
    // A continuation with nothing after it is not a reply yet. Treating it as
    // one leaves the rest in the buffer and every later step then parses the
    // tail of the previous reply instead of its own.
    expect(terminatedReply("250-smtp.example.com\r\n")).toBeNull();
    expect(terminatedReply("250 OK")).toBeNull();
  });

  it("does not mistake a line inside a reply for the end of it", () => {
    const r = terminatedReply("250-SIZE 35882577\r\n250-8BITMIME\r\n250 PIPELINING\r\nextra");
    expect(r?.reply.lines.at(-1)).toBe("250 PIPELINING");
    expect(r?.consumed).toBeLessThan("250-SIZE 35882577\r\n250-8BITMIME\r\n250 PIPELINING\r\nextra".length);
  });

  it("surfaces a non-SMTP response rather than waiting for a terminator", () => {
    // A proxy error page would otherwise loop until the step timeout.
    const r = terminatedReply("<html>502 Bad Gateway</html>\r\n");
    expect(r?.reply.code).toBe(0);
  });

  it("the capability list is read from the reply, not guessed", () => {
    const ehlo = terminatedReply("250-x\r\n250 AUTH LOGIN PLAIN\r\n")!.reply;
    expect(chooseAuth(ehlo)).toBe("PLAIN");
    const loginOnly = terminatedReply("250-x\r\n250 AUTH LOGIN\r\n")!.reply;
    expect(chooseAuth(loginOnly)).toBe("LOGIN");
    const none = terminatedReply("250-x\r\n250 SIZE 100\r\n")!.reply;
    expect(chooseAuth(none)).toBeNull();
  });
});

describe("the message body cannot end the message early", () => {
  it("doubles a line that is a single dot", () => {
    /*
     * A line consisting of "." ENDS the DATA command. A body containing one —
     * a divider, a sentence alone on a line — would be truncated there and
     * everything after it read as SMTP commands.
     */
    const out = prepareData("Line one\n.\nLine two");
    expect(out).toContain("\r\n..\r\n");
    expect(out.endsWith("\r\n.\r\n")).toBe(true);
    // And the real terminator is still exactly one dot.
    expect(out.split("\r\n.\r\n")).toHaveLength(2);
  });

  it("doubles any line that merely starts with a dot", () => {
    expect(prepareData(".hidden\nok")).toContain("..hidden");
    expect(prepareData("...\nok")).toContain("....");
  });

  it("normalizes bare newlines to CRLF", () => {
    // A bare LF is not a line ending in SMTP.
    const out = prepareData("a\nb\r\nc\rd");
    expect(out).toBe("a\r\nb\r\nc\r\nd\r\n.\r\n");
    expect(/[^\r]\n/.test(out)).toBe(false);
  });

  it("leaves an ordinary body alone apart from the terminator", () => {
    expect(prepareData("Subject: Hi\r\n\r\nHello")).toBe("Subject: Hi\r\n\r\nHello\r\n.\r\n");
  });

  it("the stuffed body is what actually goes on the wire", async () => {
    const server = fakeServer(HAPPY);
    await sendMail(server.transport, ACCOUNT, { ...MESSAGE, raw: "Subject: Hi\n\nbefore\n.\nafter" });
    expect(server.sent()).toContain("\r\n..\r\n");
  });
});

describe("telling a refusal that will pass from one that will not", () => {
  const upTo = (n: number) => [...HAPPY.slice(0, n)];

  it("a 4xx is transient and a 5xx is not", async () => {
    /*
     * The field the rest of the product acts on. A 4xx is "not now" —
     * greylisting, a rate limit — and retrying is right. A 5xx is "no", and
     * retrying burns reputation against a mailbox that will never accept.
     */
    const greylist = fakeServer([...upTo(6), "450 4.7.1 Greylisted, try again\r\n"]);
    await expect(sendMail(greylist.transport, ACCOUNT, MESSAGE)).rejects.toMatchObject({
      transient: true,
      code: 450,
      stage: "RCPT TO",
    });

    const rejected = fakeServer([...upTo(6), "550 5.1.1 No such user\r\n"]);
    await expect(sendMail(rejected.transport, ACCOUNT, MESSAGE)).rejects.toMatchObject({
      transient: false,
      code: 550,
    });
  });

  it("bad credentials are permanent and say so in words", async () => {
    const server = fakeServer([...upTo(4), "535 5.7.8 Username and Password not accepted\r\n"]);
    const err = await rejection(sendMail(server.transport, ACCOUNT, MESSAGE));
    expect(err.transient, "retrying a wrong password forever is how an account gets locked").toBe(false);
    expect(err.message).toMatch(/username or password/i);
    expect(err.stage).toBe("AUTH");
  });

  it("a 421 shutdown is transient", async () => {
    const server = fakeServer([...upTo(5), "421 4.7.0 Too many connections\r\n"]);
    await expect(sendMail(server.transport, ACCOUNT, MESSAGE)).rejects.toMatchObject({ transient: true });
  });

  it("an unreachable host is transient and names the host", async () => {
    const transport: SmtpTransport = {
      async connect() {
        throw new Error("connection refused");
      },
      async upgrade(c) {
        return c;
      },
    };
    const err = await rejection(sendMail(transport, ACCOUNT, MESSAGE));
    expect(err.transient).toBe(true);
    expect(err.stage).toBe("connect");
    expect(err.message).toContain("smtp.example.com:587");
  });

  it("a connection dropped mid-conversation is transient", async () => {
    const server = fakeServer(upTo(2));
    await expect(sendMail(server.transport, ACCOUNT, MESSAGE)).rejects.toMatchObject({ transient: true });
  });
});

describe("the password is never sent in the clear", () => {
  it("a server without STARTTLS is refused rather than downgraded", async () => {
    /*
     * The next thing on the wire after this point is the mailbox password.
     * Falling back to plaintext would succeed — which is what makes it
     * dangerous, because nothing would ever report it.
     */
    const server = fakeServer([
      "220 smtp.example.com ESMTP\r\n",
      "250-smtp.example.com\r\n250 AUTH LOGIN PLAIN\r\n",
    ]);
    const err = await rejection(sendMail(server.transport, ACCOUNT, MESSAGE));
    expect(err.stage).toBe("STARTTLS");
    expect(err.transient, "this will not fix itself on a retry").toBe(false);
    expect(server.sent()).not.toContain("AUTH");
  });

  it("implicit TLS on 465 skips STARTTLS but still authenticates", async () => {
    const server = fakeServer([
      "220 smtp.example.com ESMTP\r\n",
      "250-smtp.example.com\r\n250 AUTH LOGIN PLAIN\r\n",
      "235 Authenticated\r\n",
      "250 Sender ok\r\n",
      "250 Recipient ok\r\n",
      "354 Go\r\n",
      "250 Ok: queued\r\n",
      "221 Bye\r\n",
    ]);
    await sendMail(server.transport, { ...ACCOUNT, port: 465, implicitTls: true }, MESSAGE);
    expect(server.upgrades, "no upgrade needed on an already-encrypted socket").toBe(0);
    expect(server.sent()).not.toContain("STARTTLS");
    expect(server.sent()).toContain("AUTH");
  });

  it("the password does not appear anywhere in cleartext", async () => {
    const server = fakeServer(HAPPY);
    await sendMail(server.transport, ACCOUNT, MESSAGE);
    expect(server.sent()).not.toContain("pw");
  });
});

describe("a message the server already took is not reported as failed", () => {
  it("a connection that dies before QUIT still counts as sent", async () => {
    /*
     * The 250 for DATA is the handoff. Treating a dropped QUIT as a failure
     * would re-send a message the recipient already has.
     */
    const server = fakeServer(HAPPY.slice(0, 9));
    const { reply } = await sendMail(server.transport, ACCOUNT, MESSAGE);
    expect(reply).toContain("queued");
  });
});
