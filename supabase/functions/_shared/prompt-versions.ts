/**
 * Hashes of the texts a verdict was scored against.
 *
 * The same subject and body under two hashes are two verdicts. This does not
 * invent a history for mail that was sent before the hash existed.
 */

import { RUBRIC_SYSTEM_PROMPT } from "../check-email-rubric/prompt.ts";
import { PREVALENCE_SOURCE, CAUSAL_SOURCE } from "./evidence.ts";

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash of the subject and the final body, including a signature when it was appended. */
export async function contentHash(subject: string, body: string): Promise<string> {
  return sha256Hex(`${subject}\n${body}`);
}

export async function rubricPromptHash(): Promise<string> {
  return sha256Hex(RUBRIC_SYSTEM_PROMPT);
}

/** Hash of the claim patterns the gate uses. A pattern change is a new version. */
export async function gatePromptHash(): Promise<string> {
  return sha256Hex(`${PREVALENCE_SOURCE}\n${CAUSAL_SOURCE}`);
}
