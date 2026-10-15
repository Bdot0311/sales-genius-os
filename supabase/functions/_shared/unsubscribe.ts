/**
 * One unsubscribe mechanism, used by every path that sends outbound.
 *
 * It existed in one of the two senders and only half of it. send-email minted
 * a token and put a footer link in the body. process-scheduled-emails — the
 * path everything queued goes out through, which is to say the path that
 * carries the volume — minted nothing, wrote no footer and sent no header. It
 * checked the opt-out list on the way out and gave the recipient no way to get
 * onto it.
 *
 * Neither sender wrote a List-Unsubscribe header. Gmail and Yahoo have
 * required one from every bulk sender since February 2024, with RFC 8058
 * one-click. Not having it is invisible from inside the product: the API call
 * succeeds, the message is accepted, and it is throttled or filed in spam on
 * the far side. The send looks fine and the reply never comes, which reads as
 * the copy being weak.
 */

/** A token no two sends share. */
export function newUnsubscribeToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

export function unsubscribeUrl(supabaseUrl: string, token: string): string {
  return `${supabaseUrl}/functions/v1/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * The header pair, as MIME lines.
 *
 * https only, no mailto. One-click requires an https URI, and a mailto would
 * promise a mailbox somebody reads — the reply classifier can label an inbound
 * "unsubscribe" but nothing acts on it, and an opt-out route that silently
 * does nothing is worse than not offering it.
 *
 * List-Unsubscribe-Post is what makes the client show its own one-click
 * control rather than opening the link. Without it the header is just a
 * tidier version of the footer link.
 */
export function listUnsubscribeHeaders(url: string): string[] {
  return [
    `List-Unsubscribe: <${url}>`,
    "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
  ];
}

/** The visible link. CAN-SPAM wants one in the body whatever the headers say. */
export function unsubscribeFooterHtml(url: string): string {
  return (
    `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e5e5;` +
    `font-size:11px;color:#999;">Not interested? ` +
    `<a href="${url}" style="color:#999;">Unsubscribe</a></div>`
  );
}

/** Put the footer above </body> when there is one, else at the end. */
export function appendUnsubscribeFooter(html: string, url: string): string {
  const footer = unsubscribeFooterHtml(url);
  if (html.includes("/functions/v1/unsubscribe")) return html;
  return html.includes("</body>") ? html.replace("</body>", `${footer}\n</body>`) : html + footer;
}

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Mint and store a token for this sender and recipient.
 *
 * Scoped to the sender. The old upsert keyed on the address alone, so two
 * accounts mailing the same person overwrote each other — the second send
 * invalidated the unsubscribe link the first had already delivered, and the
 * recipient's click landed on "this link is not valid".
 */
export async function mintUnsubscribeToken(
  supabase: Db,
  userId: string,
  email: string,
): Promise<string> {
  const token = newUnsubscribeToken();
  const { error } = await supabase
    .from("email_unsubscribe_tokens")
    .upsert(
      { email: email.toLowerCase().trim(), user_id: userId, token, used_at: null },
      { onConflict: "user_id,email" },
    );
  // A send must not fail because the token row did not write; the footer and
  // header still carry a token, and an unmatched one reports itself at the
  // endpoint rather than blocking an email.
  if (error) console.error("[unsubscribe] token not persisted:", error.message);
  return token;
}

/**
 * Whether this sender may email this address.
 *
 * Matches an opt-out this sender owns, or a global one. Rows written before
 * opt-outs carried a sender are global, and stay that way: re-scoping them to
 * whoever happened to send the email would hand every other account a list of
 * people who have already said no.
 */
export async function isOptedOut(supabase: Db, userId: string, email: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("email_optouts")
    .select("id, user_id")
    .eq("email", email.toLowerCase().trim());
  if (error) {
    // Fail closed on a read error: sending to someone who opted out is the
    // expensive mistake, not holding one email back.
    console.error("[unsubscribe] opt-out check failed, holding send:", error.message);
    return true;
  }
  return (data ?? []).some((r: { user_id: string | null }) => r.user_id === null || r.user_id === userId);
}
