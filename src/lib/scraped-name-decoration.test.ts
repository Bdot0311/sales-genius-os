import { describe, expect, it } from "vitest";
import {
  fallbackSubjectFrom,
  thinLeadDraft,
  releasableFirstTouch,
  usableSubject,
  withoutDecoration,
} from "../../supabase/functions/_shared/first-touch-fallback";

/**
 * A lead card read "Joshua Perk 👻 · Vector 👻" and the draft went out under
 * the subject "Vector 👻".
 *
 * The ghost is the prospect's own decoration on their profile. Echoing it
 * back is the sender writing in somebody else's voice, and it reads as a
 * field pasted straight out of a scrape.
 *
 * usableFallbackFact already refuses an emoji inside a research sentence --
 * "a wink about their IPO is the social post's tone, not a first touch". The
 * same position had never been applied to the lead's own name fields.
 */
describe("a scraped name is cleaned before it is written", () => {
  it("keeps it out of the subject line", () => {
    expect(fallbackSubjectFrom("Something unquotable here.", "Vector 👻")).toBe("Vector");
    expect(fallbackSubjectFrom("Vector builds data tooling for teams.", "Vector 👻"))
      .toBe("data tooling at Vector");
  });

  it("keeps it out of the greeting", () => {
    const draft = thinLeadDraft({
      firstName: "Joshua 👻", senderName: "Brandon Yakubov", company: "Vector 👻", role: "Founder",
    });
    expect(draft.body).toMatch(/^Hi Joshua,/);
    expect(draft.subject).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(draft.body).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("keeps it out of the grounded first touch too", () => {
    const body = releasableFirstTouch({
      firstName: "Joshua 👻", fact: "Vector builds data tooling for teams.", senderName: "Brandon Yakubov",
    });
    expect(body).toMatch(/^Hi Joshua,/);
  });

  it("refuses a subject that still carries one, wherever it was built", () => {
    // A backstop for a subject assembled somewhere this module does not reach.
    expect(usableSubject("Vector 👻")).toBe(false);
    expect(usableSubject("data tooling at Vector")).toBe(true);
  });

  it("strips the separator left stranded by what it removed", () => {
    expect(withoutDecoration("Acme | 👻")).toBe("Acme");
    expect(withoutDecoration("Acme — 🚀")).toBe("Acme");
  });

  it("leaves a real name alone", () => {
    /*
     * The rule is pictographs and the joiners that carry them. Accents,
     * currency, ampersands, punctuation and non-Latin scripts are part of a
     * company's actual name, and stripping them would be the same defect
     * pointed the other way.
     */
    for (const name of ["Café Ltd.", "Søren & Co", "日本の会社", "Acme, Inc.", "AT&T", "L'Oréal", "Ørsted"]) {
      expect(withoutDecoration(name), name).toBe(name);
    }
  });

  it("falls back cleanly when the name was nothing but decoration", () => {
    expect(withoutDecoration("👻")).toBe("");
    const draft = thinLeadDraft({ firstName: "👻", senderName: "Brandon Yakubov", company: "👻" });
    expect(draft.body).toMatch(/^Hi there,/);
    expect(draft.subject).toBe("Quick question");
  });

  it("handles a flag, which is two code points and neither is an emoji on its own", () => {
    expect(withoutDecoration("🇺🇸 Acme")).toBe("Acme");
  });
});
