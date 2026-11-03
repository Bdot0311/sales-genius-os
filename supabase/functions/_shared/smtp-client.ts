/**
 * Submitting a message over SMTP.
 *
 * `send-email` had exactly one transport, the Gmail API, and answered
 * "Unsupported email provider" to everything else. That was fine while every
 * mailbox arrived through Google OAuth. It stops being fine the moment a
 * mailbox is provisioned somewhere else and hands back a password instead of a
 * token, because there is then nothing in the product that can send from it.
 *
 * Whether this runtime could open a mail submission socket at all was an open
 * question for weeks; `smtp-capability-probe` answered it — the runtime does
 * connect — so this is buildable here rather than needing a relay.
 *
 * Written against the socket rather than pulled from a registry because the
 * conversation is small and the failure modes are specific enough to want in
 * view. The transport is injected so the whole exchange can be tested without
 * a network, which is the only way to exercise the parts that actually break:
 * multiline replies, dot-stuffing, and telling a transient refusal apart from
 * a permanent one.
 */

export interface SmtpConnection {
  read(p: Uint8Array): Promise<number | null>;
  write(p: Uint8Array): Promise<number>;
  close(): void;
}

export interface SmtpTransport {
  connect(opts: { hostname: string; port: number; tls: boolean }): Promise<SmtpConnection>;
  /** Upgrade a plaintext connection after STARTTLS. */
  upgrade(conn: SmtpConnection, hostname: string): Promise<SmtpConnection>;
}

export interface SmtpAccount {
  hostname: string;
  port: number;
  username: string;
  password: string;
  /** Implicit TLS (port 465). Otherwise STARTTLS is required on 587/25. */
  implicitTls?: boolean;
}

export interface SmtpMessage {
  from: string;
  to: string;
  /** The full RFC822 message, headers and body, exactly as it should arrive. */
  raw: string;
}

export class SmtpError extends Error {
  constructor(
    message: string,
    /** The reply code, when the server gave one. */
    readonly code: number | null,
    /**
     * Whether trying again later could work.
     *
     * This is the field the rest of the product acts on. A 4xx is the server
     * saying "not now" — greylisting, a rate limit, a full mailbox — and
     * retrying is correct. A 5xx is "no", and retrying it burns reputation
     * against a mailbox that will never accept. Collapsing the two is how a
     * hard bounce gets retried for a week, or a greylist gets recorded as a
     * dead address and the lead is suppressed for good.
     */
    readonly transient: boolean,
    /** Which step failed, for the failure reason a user reads. */
    readonly stage: string,
  ) {
    super(message);
    this.name = "SmtpError";
  }
}

const CRLF = "\r\n";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Default per-step deadline. A hung server must not wedge the function. */
export const SMTP_STEP_TIMEOUT_MS = 20_000;

function b64(s: string): string {
  return btoa(String.fromCharCode(...encoder.encode(s)));
}

/**
 * A reply, which may have arrived over several lines and several reads.
 *
 * SMTP continuation is marked by a hyphen in the fourth column:
 *
 *   250-smtp.example.com greets you
 *   250-STARTTLS
 *   250 AUTH LOGIN PLAIN     <- space, so this is the last line
 *
 * Reading one line and moving on leaves the rest in the buffer, and every
 * later step then parses the tail of the previous reply instead of its own.
 * The symptom is a conversation that fails several steps after the mistake,
 * which is why this reads to the terminator rather than to the first newline.
 */
export interface SmtpReply {
  code: number;
  lines: string[];
  text: string;
}

class Session {
  private buffer = "";
  constructor(private conn: SmtpConnection, private timeoutMs: number) {}

  replace(conn: SmtpConnection) {
    this.conn = conn;
  }

  private async withTimeout<T>(p: Promise<T>, stage: string): Promise<T> {
    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new SmtpError(`The mail server stopped responding during ${stage}.`, null, true, stage)),
        this.timeoutMs,
      ) as unknown as number;
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  async send(line: string, stage: string): Promise<void> {
    await this.withTimeout(this.conn.write(encoder.encode(line + CRLF)), stage);
  }

  /** Write the message body, which is already dot-stuffed and CRLF-terminated. */
  async sendRaw(data: string, stage: string): Promise<void> {
    await this.withTimeout(this.conn.write(encoder.encode(data)), stage);
  }

  async read(stage: string): Promise<SmtpReply> {
    for (;;) {
      const complete = terminatedReply(this.buffer);
      if (complete) {
        this.buffer = this.buffer.slice(complete.consumed);
        return complete.reply;
      }
      const chunk = new Uint8Array(4096);
      const n = await this.withTimeout(this.conn.read(chunk), stage);
      if (n === null || n === 0) {
        throw new SmtpError(
          `The mail server closed the connection during ${stage}.`,
          null,
          true,
          stage,
        );
      }
      this.buffer += decoder.decode(chunk.subarray(0, n));
    }
  }

  async expect(stage: string, ...ok: number[]): Promise<SmtpReply> {
    const reply = await this.read(stage);
    if (!ok.includes(Math.floor(reply.code / 100)) && !ok.includes(reply.code)) {
      throw new SmtpError(replyMessage(stage, reply), reply.code, reply.code < 500, stage);
    }
    return reply;
  }
}

/** A complete reply at the head of `buf`, or null if more bytes are needed. */
export function terminatedReply(buf: string): { reply: SmtpReply; consumed: number } | null {
  const lines: string[] = [];
  let consumed = 0;
  let rest = buf;
  for (;;) {
    const idx = rest.indexOf("\n");
    if (idx === -1) return null;
    const line = rest.slice(0, idx).replace(/\r$/, "");
    consumed += idx + 1;
    rest = rest.slice(idx + 1);
    lines.push(line);
    // `NNN ` ends the reply; `NNN-` continues it.
    if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
      const code = Number.parseInt(line.slice(0, 3), 10);
      return {
        reply: { code, lines, text: lines.map((l) => l.slice(4)).join(" ").trim() },
        consumed,
      };
    }
    if (!/^\d{3}-/.test(line)) {
      // Not SMTP at all — a proxy error page, say. Surface it rather than
      // looping until the timeout.
      return {
        reply: { code: 0, lines, text: lines.join(" ").trim() },
        consumed,
      };
    }
  }
}

function replyMessage(stage: string, reply: SmtpReply): string {
  const detail = reply.text ? `: ${reply.text.slice(0, 200)}` : "";
  if (reply.code === 0) return `The mail server sent something that is not an SMTP reply during ${stage}${detail}`;
  if (reply.code === 535 || reply.code === 534) {
    return `The mailbox rejected its username or password (${reply.code})${detail}`;
  }
  if (reply.code === 550 || reply.code === 553) {
    return `The recipient was rejected (${reply.code})${detail}`;
  }
  if (reply.code === 421 || reply.code === 450 || reply.code === 451 || reply.code === 452) {
    return `The mail server asked us to try later (${reply.code})${detail}`;
  }
  return `The mail server refused ${stage} (${reply.code})${detail}`;
}

/**
 * Prepare a message for the DATA command.
 *
 * Two transformations, both of which are protocol requirements rather than
 * tidying:
 *
 *   - Every line ends CRLF. A bare LF is not a line ending in SMTP, and
 *     servers that tolerate it are not the ones that matter.
 *   - A line consisting of a single "." ENDS the message. A body containing
 *     one — a signature divider, a sentence on its own line — would otherwise
 *     be truncated there and the remainder interpreted as SMTP commands. Any
 *     line starting with "." gets a second one, which the receiver removes.
 */
export function prepareData(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const stuffed = normalized
    .split("\n")
    .map((line) => (line.startsWith(".") ? "." + line : line))
    .join(CRLF);
  return stuffed + CRLF + "." + CRLF;
}

/** Pick an AUTH mechanism the server offered. */
export function chooseAuth(ehlo: SmtpReply): "PLAIN" | "LOGIN" | null {
  const line = ehlo.lines.find((l) => /AUTH[ =]/i.test(l));
  if (!line) return null;
  const upper = line.toUpperCase();
  if (upper.includes("PLAIN")) return "PLAIN";
  if (upper.includes("LOGIN")) return "LOGIN";
  return null;
}

function supportsStartTls(ehlo: SmtpReply): boolean {
  return ehlo.lines.some((l) => /STARTTLS/i.test(l));
}

/**
 * Submit one message. Resolves with the server's final reply text.
 *
 * One message per connection on purpose. Reusing a connection across
 * recipients is how a provider's per-connection limits get hit mid-batch, and
 * the sends in this product are already paced per account by the scheduler.
 */
export async function sendMail(
  transport: SmtpTransport,
  account: SmtpAccount,
  message: SmtpMessage,
  opts: { timeoutMs?: number; heloName?: string } = {},
): Promise<{ reply: string }> {
  const timeoutMs = opts.timeoutMs ?? SMTP_STEP_TIMEOUT_MS;
  const helo = opts.heloName ?? "outreign.io";

  let conn: SmtpConnection;
  try {
    conn = await transport.connect({
      hostname: account.hostname,
      port: account.port,
      tls: !!account.implicitTls,
    });
  } catch (e) {
    // Could not reach the server at all: a DNS failure, a refused port, a
    // blocked egress. Worth retrying, and worth naming the host.
    throw new SmtpError(
      `Could not reach ${account.hostname}:${account.port} (${e instanceof Error ? e.message : String(e)})`,
      null,
      true,
      "connect",
    );
  }

  const session = new Session(conn, timeoutMs);
  try {
    await session.expect("greeting", 2);
    await session.send(`EHLO ${helo}`, "EHLO");
    let ehlo = await session.expect("EHLO", 2);

    if (!account.implicitTls) {
      /*
       * STARTTLS is required, not preferred.
       *
       * The next thing on the wire is the mailbox password. Falling back to
       * plaintext because a server did not advertise STARTTLS would put it
       * there in the clear, and the failure would be invisible — the send
       * succeeds, so nothing ever reports it.
       */
      if (!supportsStartTls(ehlo)) {
        throw new SmtpError(
          `${account.hostname} does not offer STARTTLS, so the password cannot be sent safely.`,
          null,
          false,
          "STARTTLS",
        );
      }
      await session.send("STARTTLS", "STARTTLS");
      await session.expect("STARTTLS", 2);
      conn = await transport.upgrade(conn, account.hostname);
      session.replace(conn);
      // The session restarts after the upgrade, and the server may advertise
      // a different set of extensions once the connection is secure — AUTH
      // in particular is commonly withheld until then.
      await session.send(`EHLO ${helo}`, "EHLO");
      ehlo = await session.expect("EHLO", 2);
    }

    const mech = chooseAuth(ehlo);
    if (!mech) {
      throw new SmtpError(`${account.hostname} did not offer a supported way to sign in.`, null, false, "AUTH");
    }
    if (mech === "PLAIN") {
      await session.send(`AUTH PLAIN ${b64(`\0${account.username}\0${account.password}`)}`, "AUTH");
      await session.expect("AUTH", 2);
    } else {
      await session.send("AUTH LOGIN", "AUTH");
      await session.expect("AUTH", 334);
      await session.send(b64(account.username), "AUTH");
      await session.expect("AUTH", 334);
      await session.send(b64(account.password), "AUTH");
      await session.expect("AUTH", 2);
    }

    await session.send(`MAIL FROM:<${message.from}>`, "MAIL FROM");
    await session.expect("MAIL FROM", 2);
    await session.send(`RCPT TO:<${message.to}>`, "RCPT TO");
    await session.expect("RCPT TO", 2);
    await session.send("DATA", "DATA");
    await session.expect("DATA", 354);
    await session.sendRaw(prepareData(message.raw), "DATA");
    const accepted = await session.expect("the message", 2);

    try {
      await session.send("QUIT", "QUIT");
    } catch {
      // The message is already accepted; a server that drops the connection
      // before QUIT has still taken it, and failing here would report a
      // delivered message as failed.
    }
    return { reply: accepted.text };
  } finally {
    try {
      conn.close();
    } catch {
      // Already closed by the far side.
    }
  }
}
