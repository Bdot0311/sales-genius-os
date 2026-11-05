import { describe, expect, it } from "vitest";
import { describeApplication, DFY_SOURCE, type DfyApplicationRow } from "./dfy-applications";

const row = (over: Partial<DfyApplicationRow> = {}): DfyApplicationRow => ({
  id: "r1",
  created_at: "2026-11-05T00:00:00Z",
  contact_name: "Dana Reed",
  contact_email: "dana@acme.com",
  plan: "managed",
  booked_at: null,
  status: null,
  metadata: {
    company: "Acme",
    website: "acme.com",
    sells: "payroll software to HR teams",
    outbound_today: "agency",
    deal_size: "25k_100k",
    sales_cycle: "30_90d",
  },
  ...over,
});

describe("describeApplication", () => {
  it("reads the answers back out of metadata", () => {
    const d = describeApplication(row());
    expect(d.name).toBe("Dana Reed");
    expect(d.company).toBe("Acme");
    expect(d.sells).toBe("payroll software to HR teams");
    expect(d.outboundToday).toBe("Agency");
    expect(d.dealSize).toBe("$25k–100k");
    expect(d.salesCycle).toBe("30–90d");
    expect(d.rung).toBe("Managed");
  });

  /*
   * The runbook's hard check. A prospect whose deal cycle is longer than the
   * term cannot produce a result inside a founding seat, and the whole point
   * of asking is to know that before the seat is spent.
   */
  it("flags a sales cycle longer than the 90-day term", () => {
    expect(describeApplication(row({ metadata: { sales_cycle: "90_180d" } })).cycleTooLong).toBe(true);
    expect(describeApplication(row({ metadata: { sales_cycle: "over_180d" } })).cycleTooLong).toBe(true);
  });

  it("does not flag a cycle that fits inside the term", () => {
    expect(describeApplication(row({ metadata: { sales_cycle: "under_30d" } })).cycleTooLong).toBe(false);
    expect(describeApplication(row({ metadata: { sales_cycle: "30_90d" } })).cycleTooLong).toBe(false);
  });

  /*
   * Nothing enforces the shape of a JSON column, so every read has to survive
   * the row being older than the current question set, or hand-edited.
   */
  it("survives metadata that is missing, empty or the wrong type", () => {
    for (const metadata of [null, undefined, {}, "not an object", 42, []]) {
      const d = describeApplication(row({ metadata }));
      expect(d.sells).toBe("—");
      expect(d.dealSize).toBe("—");
      expect(d.cycleTooLong).toBe(false);
    }
  });

  it("shows a dash rather than a raw code for an unanswered picker", () => {
    const d = describeApplication(row({ metadata: { outbound_today: "unspecified" }, plan: "unspecified" }));
    expect(d.outboundToday).toBe("—");
    expect(d.rung).toBe("—");
  });

  it("falls back to the raw value for a code it does not know", () => {
    expect(describeApplication(row({ plan: "enterprise" })).rung).toBe("enterprise");
  });

  it("names an applicant who gave no name", () => {
    expect(describeApplication(row({ contact_name: null })).name).toBe("Unnamed");
    expect(describeApplication(row({ contact_name: "   " })).name).toBe("Unnamed");
  });

  it("pins the source string the admin tab and the writer agree on", () => {
    expect(DFY_SOURCE).toBe("dfy_application");
  });
});
