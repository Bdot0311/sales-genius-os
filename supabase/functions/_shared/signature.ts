// Shared email-signature resolution.
//
// Users pick where their signature comes from (profiles.signature_source):
//   'gmail'  -> pulled live from Gmail's sendAs settings (cached into
//               profiles.email_signature so background jobs can use it)
//   'custom' -> the signature typed into the app (profiles.email_signature)
//   'none'   -> no signature appended
// A null/absent value behaves like 'custom' when a signature exists, else 'none'.

export type SignatureSource = "gmail" | "custom" | "none";

/** Fetch the primary sendAs signature from Gmail. Requires gmail.readonly. */
export async function fetchGmailSignature(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      console.warn(`fetchGmailSignature failed [${res.status}]: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const list: any[] = Array.isArray(data?.sendAs) ? data.sendAs : [];
    const primary = list.find((s) => s?.isPrimary) ?? list.find((s) => s?.isDefault) ?? list[0];
    const sig = (primary?.signature ?? "").trim();
    return sig || null;
  } catch (e) {
    console.warn("fetchGmailSignature threw (non-fatal):", e);
    return null;
  }
}

/**
 * Resolve the signature HTML to append for a user.
 * Pass a fresh Gmail access token when available so 'gmail' users get their
 * live signature (it is also cached for background/scheduled sends).
 */
export async function getSignatureHtml(
  admin: any,
  userId: string,
  accessToken?: string | null,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("profiles")
      .select("email_signature, signature_source")
      .eq("id", userId)
      .maybeSingle();

    const stored = (data?.email_signature ?? "").trim() || null;
    const source: SignatureSource =
      (data?.signature_source as SignatureSource | null) ?? (stored ? "custom" : "none");

    if (source === "none") return null;

    if (source === "gmail") {
      if (accessToken) {
        const live = await fetchGmailSignature(accessToken);
        if (live) {
          if (live !== stored) {
            await admin.from("profiles").update({ email_signature: live }).eq("id", userId);
          }
          return live;
        }
      }
      return stored;
    }

    return stored;
  } catch (e) {
    console.warn("getSignatureHtml threw (non-fatal):", e);
    return null;
  }
}

/** Append a signature to a body once (no-op when already present). */
export function appendSignatureToBody(body: string, signature: string | null): string {
  if (!signature) return body;
  const probe = signature.replace(/<[^>]+>/g, "").trim().slice(0, 40);
  if (probe && body.includes(probe)) return body;
  if (body.includes(signature.trim())) return body;
  return `${body.trimEnd()}\n\n${signature.trim()}`;
}
