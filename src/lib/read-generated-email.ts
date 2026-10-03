/**
 * Reading a generate-email response without crashing on a refusal.
 *
 * generate-email answers HTTP 200 with `{ error, error_code }` for the things
 * it deliberately declines to do — no sender name, research too thin,
 * fabricated metric, unfilled placeholder, unsupported recency. Five reasons,
 * all of them explanations a user could act on.
 *
 * supabase-js reports a 200 as success, so `error` is null and every caller's
 * `if (error) throw error` waves it through. The next line then reads `.email`
 * off a payload that does not have one, and the browser throws
 *
 *   undefined is not an object (evaluating 'p.email.trim')
 *
 * which lands in the catch and gets shown to the user as the failure. So the
 * product knew exactly what was wrong, had written it down, and displayed a
 * minified type error instead.
 *
 * The same shape as readFunctionError in handle-send-error: the reason exists,
 * and the job is to stop throwing it away.
 */

export interface GeneratedEmailPayload {
  email?: unknown;
  error?: unknown;
  error_code?: unknown;
}

export class GenerationRefused extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "GenerationRefused";
    this.code = code;
  }
}

/**
 * The generated text, or a thrown error carrying the reason the caller can show.
 *
 * `invokeError` is whatever supabase-js reported, passed through so a caller
 * has one thing to check instead of two.
 */
/** Removes a leading "Subject: ..." line the model writes above the body. */
export function stripLeadingSubject(text: string): string {
  return String(text ?? "").replace(/^\s*subject\s*:[^\n]*(?:\n|$)/i, "").replace(/^\s*\n/, "");
}

/** The email body, with any model-written subject line removed. */
export function readGeneratedEmail(
  data: GeneratedEmailPayload | null | undefined,
  invokeError?: { message?: string } | null,
): string {
  const body = stripLeadingSubject(readRaw(data, invokeError));
  if (!body.trim()) throw new Error("The generator returned nothing usable. Try again.");
  return body;
}

function readRaw(
  data: GeneratedEmailPayload | null | undefined,
  invokeError?: { message?: string } | null,
): string {
  if (invokeError) {
    throw new Error(invokeError.message || "The generator did not respond.");
  }

  // A refusal, stated by the function itself. This is the branch that used to
  // fall through into a type error.
  if (data && typeof data.error === "string" && data.error) {
    throw new GenerationRefused(data.error, typeof data.error_code === "string" ? data.error_code : "refused");
  }

  const email = data?.email;
  if (typeof email !== "string" || !email.trim()) {
    // Nothing usable and no reason given. Say that, rather than letting the
    // caller discover it by dereferencing undefined.
    throw new Error("The generator returned nothing usable. Try again.");
  }

  return email;
}

/** The subject line out of a response, with any leading "Subject:" removed. */
export function readGeneratedSubject(
  data: GeneratedEmailPayload | null | undefined,
  invokeError?: { message?: string } | null,
): string {
  return readRaw(data, invokeError).split("\n")[0].replace(/^Subject:\s*/i, "").trim();
}
