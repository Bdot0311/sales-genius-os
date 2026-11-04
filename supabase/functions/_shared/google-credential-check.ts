/*
 * Is the Google client id/secret pair this deployment holds actually good?
 *
 * Google sign-in failed with "Unable to exchange external code: 4/0A...".
 * That error is raised by the auth server at /auth/v1/callback, at the one
 * step nothing here can see: it POSTs Google's authorization code, the client
 * id and the client SECRET to oauth2.googleapis.com/token, and Google says
 * no. Google had already issued the code, so the client id and the redirect
 * URI were both accepted a moment earlier. The secret is the only input left.
 *
 * Which left the same unanswerable question as before: is the secret we hold
 * the one Google expects, or a stale copy from before a rotation? Reading its
 * length and fingerprint says a value is set. It cannot say the value works.
 *
 * So ask Google. Send a code that cannot possibly be valid. Google rejects it
 * either way, and WHICH rejection comes back is the answer, because client
 * authentication happens before the code is ever looked at:
 *
 *   invalid_client  the id/secret pair is wrong
 *   invalid_grant   the pair authenticated; only the throwaway code was refused
 *
 * Nothing secret crosses the wire that was not already Google's, and nothing
 * secret comes back.
 */

export type GoogleCredentialVerdict = "valid" | "invalid" | "unknown";

export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** A code Google cannot mistake for one of its own, so it is always refused. */
export const THROWAWAY_CODE = "outreign-credential-probe-not-a-real-code";

export interface GoogleCredentialCheck {
  verdict: GoogleCredentialVerdict;
  /** Google's own `error` field, kept so an unexpected answer is still legible. */
  googleError: string | null;
  detail: string;
}

/**
 * Read a verdict out of Google's token-endpoint response.
 *
 * Split from the request so the classification can be tested without reaching
 * Google, and so the rule that produces the verdict is stated in one place.
 */
export function classifyGoogleTokenResponse(status: number, body: unknown): GoogleCredentialCheck {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).error : undefined;
  const googleError = typeof raw === "string" && raw.length > 0 ? raw : null;

  if (googleError === "invalid_client" || status === 401) {
    return {
      verdict: "invalid",
      googleError,
      detail:
        "Google rejected the client id and secret together. The secret these functions hold is not the one Google expects — it is stale, truncated, or belongs to a different OAuth client.",
    };
  }

  if (googleError === "invalid_grant") {
    return {
      verdict: "valid",
      googleError,
      detail:
        "Google authenticated the client and refused only the throwaway code, which is exactly what a correct id and secret look like here.",
    };
  }

  return {
    verdict: "unknown",
    googleError,
    detail: googleError
      ? `Google answered with "${googleError}", which does not separate a good secret from a bad one.`
      : `Google answered ${status} with no error field, so the pair could not be judged.`,
  };
}

/**
 * Ask Google whether a client id and secret authenticate together.
 *
 * `fetchImpl` is injected so tests drive the responses rather than the network.
 */
export async function verifyGoogleCredential(
  clientId: string,
  clientSecret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleCredentialCheck> {
  if (!clientId || !clientSecret) {
    return {
      verdict: "unknown",
      googleError: null,
      detail: "Both the client id and the client secret have to be set before Google can be asked.",
    };
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code: THROWAWAY_CODE,
    // Never visited. The code is refused before a redirect URI matters.
    redirect_uri: "https://outreign.io/auth",
  });

  try {
    const res = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return classifyGoogleTokenResponse(res.status, parsed);
  } catch (err) {
    return {
      verdict: "unknown",
      googleError: null,
      detail: `Could not reach Google to check: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
