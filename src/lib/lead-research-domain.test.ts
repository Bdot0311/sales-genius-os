import { describe, expect, it } from "vitest";
import { resolveLeadDomain } from "../../supabase/functions/_shared/lead-research";

describe("which site research reads for a lead", () => {
  it("skips a LinkedIn profile saved as the website and uses the work email domain", () => {
    expect(resolveLeadDomain({
      company_website: "https://www.linkedin.com/in/casey-mccormick-392a8326",
      contact_email: "casey@marea.ai",
    })).toBe("marea.ai");
  });

  it("returns no site when the website is a profile and the email is free mail", () => {
    expect(resolveLeadDomain({ company_website: "linkedin.com/in/x", contact_email: "x@gmail.com" })).toBeNull();
  });

  it("keeps a real company website", () => {
    expect(resolveLeadDomain({ company_website: "https://getbluejay.ai", contact_email: "a@other.com" })).toBe("getbluejay.ai");
  });
});

import { readableSentence } from "../../supabase/functions/_shared/evidence-contract";

describe("which researched sentences can open an email", () => {
  it("refuses page titles glued together", () => {
    expect(readableSentence("Test, monitor, and improve voice & chat AI agents.Test, monitor, and improve voice & chat AI agents.")).toBe(false);
  });
  it("refuses a short tagline", () => {
    expect(readableSentence("Win at Work. Win at Life.")).toBe(false);
  });
  it("keeps a normal sentence about the company", () => {
    expect(readableSentence("Bluejay raised a seed round to help teams test voice agents before launch.")).toBe(true);
  });
});

describe("directory boilerplate is not a fact", () => {
  it("refuses an 'official website' line", () => {
    expect(readableSentence("SeekFirst s official website is leadfirst.ai and has social profiles on LinkedIn.")).toBe(false);
  });
});
