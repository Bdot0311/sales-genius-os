import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  GenerationRefused,
  readGeneratedEmail,
  readGeneratedSubject,
} from "./read-generated-email";

const STUDIO = readFileSync("src/pages/Outreach.tsx", "utf8");
const BULK = readFileSync("src/components/outreach/BulkSendDialog.tsx", "utf8");
const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const CI = readFileSync(".github/workflows/schema-check.yml", "utf8");

/**
 * "Trigger and subject lines don't work."
 *
 *   Error generating trigger — undefined is not an object (evaluating 'p.email.trim')
 *   Error generating subject — undefined is not an object (evaluating 'N.email.replace')
 *
 * Two faults stacked. generate-email refused the request for a reason it had
 * written down, and the browser then read `.email` off the refusal and threw a
 * type error, which is what got shown in place of the reason.
 */

describe("a refusal is read as a refusal", () => {
  it("throws the reason the function gave, not a type error", () => {
    const refusal = { error: "No sender name is set, so the email cannot be signed.", error_code: "no_sender_name" };
    expect(() => readGeneratedEmail(refusal)).toThrow(/No sender name is set/);
  });

  it("carries the code, so a caller can special-case one", () => {
    try {
      readGeneratedEmail({ error: "too thin", error_code: "research_too_thin" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GenerationRefused);
      expect((e as GenerationRefused).code).toBe("research_too_thin");
    }
  });

  it("returns the email when there is one", () => {
    expect(readGeneratedEmail({ email: "Hi Sarah,\n\nNoticed the four SDR roles." })).toContain("Noticed");
  });

  it("reports a transport failure rather than swallowing it", () => {
    expect(() => readGeneratedEmail({ email: "x" }, { message: "Edge Function returned a non-2xx status code" }))
      .toThrow(/non-2xx/);
  });

  it("says something usable when the payload is empty in both directions", () => {
    // The case that produced "undefined is not an object".
    expect(() => readGeneratedEmail({})).toThrow(/returned nothing usable/);
    expect(() => readGeneratedEmail(null)).toThrow(/returned nothing usable/);
    expect(() => readGeneratedEmail({ email: "   " })).toThrow(/returned nothing usable/);
  });

  it("strips the Subject: prefix when reading a subject", () => {
    expect(readGeneratedSubject({ email: "Subject: four open SDR roles" })).toBe("four open SDR roles");
    expect(readGeneratedSubject({ email: "four open SDR roles" })).toBe("four open SDR roles");
  });
});

/**
 * The reason the two buttons failed for everyone, every time.
 *
 * generate-email refuses with no_sender_name when it cannot work out who signs
 * the email. Outreach Studio's standalone "generate subject" and "generate
 * trigger" buttons send neither senderName nor senderEmail — they have no
 * signature to fill — so the gate refused every press. The same two goals
 * called from inside the main Generate flow do pass senderName, which is why
 * that path worked and these did not.
 */
describe("a fragment with no signature does not need a signer", () => {
  it("exempts the goals that return one", () => {
    expect(GEN).toContain("SIGNATURE_FREE_GOALS");
    expect(GEN).toContain("'subject_only', 'trigger_context'");
    expect(GEN).toContain("if (needsSignature && !resolvedSenderName)");
  });

  it("still refuses to sign a real email with nobody's name", () => {
    // The gate exists because drafts were going out signed "[Sender Name]".
    expect(GEN).toContain("error_code: 'no_sender_name'");
  });
});

describe("no call site reads .email off a payload that may not have one", () => {
  it("the studio routes all four through the reader", () => {
    expect(STUDIO).not.toMatch(/\bdata\.email\.(replace|trim)/);
    expect(STUDIO).not.toMatch(/subjectData\.email\./);
    expect(STUDIO).toContain("readGeneratedSubject(data, error)");
    expect(STUDIO).toContain("readGeneratedEmail(data, error)");
  });

  it("the bulk sender does too, where one reason applies to every lead", () => {
    expect(BULK).not.toMatch(/subData\.email\./);
    expect(BULK).not.toMatch(/bodyData\.email\b(?!\s*\))/);
    expect(BULK).toContain("readGeneratedSubject(subData, subErr)");
    expect(BULK).toContain("readGeneratedEmail(bodyData, bodyErr)");
  });

  it("imports it where it uses it", () => {
    // A missing import here compiled and would have thrown at runtime, because
    // the typecheck everyone ran was checking nothing.
    for (const [name, src] of [["Outreach", STUDIO], ["BulkSendDialog", BULK]] as const) {
      expect(src, `${name} is missing the import`).toContain('from "@/lib/read-generated-email"');
    }
  });
});

/**
 * tsconfig.json declares "files": [] and defers to project references, so
 * `tsc --noEmit` compiles zero files and exits 0 whatever is broken. A missing
 * import passed it and was caught instantly by `tsc -b`. The build does not
 * cover this either: esbuild transpiles without typechecking, so a free
 * identifier becomes a runtime ReferenceError rather than a failed build.
 */
describe("the typecheck in CI checks something", () => {
  it("runs the project-reference build, not the no-op", () => {
    expect(CI).toContain("npx tsc -b");
    expect(CI).not.toMatch(/run: npx tsc --noEmit\s*$/m);
  });

  it("records why, so nobody swaps it back for the shorter command", () => {
    expect(CI).toMatch(/compiles zero files/i);
  });

  it("installs exactly what the lockfile pins", () => {
    // npm ci used to refuse outright: package.json declared
    // @lovable.dev/email-js and the lockfile did not carry it, so a clean
    // install of this repo was impossible for anyone. Now that the lockfile
    // is whole, ci is the right command — it fails loudly if the two drift
    // apart again, which install would quietly paper over.
    const job = CI.slice(CI.indexOf("typecheck:"), CI.indexOf("skills-bundle:"));
    expect(job).toContain("npm ci");
    expect(job).not.toMatch(/run: npm install/);
  });
});
