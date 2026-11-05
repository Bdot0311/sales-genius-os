import { describe, expect, it } from "vitest";
import { normalizeDfySalesAnswers } from "../../supabase/functions/_shared/dfy-sales-model";
import { describeApplication, type DfyApplicationRow } from "./dfy-applications";

const view = (metadata: unknown) => describeApplication({ metadata, plan: null, contact_name: null,
  contact_email: null, id: "test", created_at: "", booked_at: null, status: null } satisfies DfyApplicationRow);

describe("DFY business models and actual timelines", () => {
  it("retains subscription pricing and instant onboarding without a sales-led cycle", () => {
    const answers = normalizeDfySalesAnswers({ salesModel: "subscription", buyingMotion: "self_serve",
      customerValue: "USD 49", billingBasis: "monthly", buyingTimeline: "30 days", onboardingTimeline: "15 minutes" });
    expect(answers.sales_model).toBe("subscription");
    expect(answers.customer_value).toBe("USD 49");
    expect(answers.billing_basis).toBe("monthly");
    expect(answers.buying_timeline).toBe("");
    expect(answers.onboarding_timeline).toBe("15 minutes");
    expect(view(answers).cycleTooLong).toBe(false);
  });
  it("retains the applicant's actual high-ticket buying timeline instead of a generic range", () => {
    const answers = normalizeDfySalesAnswers({ salesModel: "high_ticket", buyingMotion: "sales_led",
      customerValue: "USD 18,500", billingBasis: "one_time", buyingTimeline: "47 days", onboardingTimeline: "stale answer" });
    expect(answers.buying_timeline).toBe("47 days");
    expect(answers.onboarding_timeline).toBe("");
    expect(view(answers).salesCycle).toBe("47 days");
  });
  it("supports sales-led SaaS rather than treating all subscriptions as self-serve", () => {
    const answers = normalizeDfySalesAnswers({ salesModel: "subscription", buyingMotion: "sales_led",
      billingBasis: "annual", buyingTimeline: "6 weeks", onboardingTimeline: "2 days" });
    expect(answers.billing_basis).toBe("annual");
    expect(view(answers).salesCycle).toBe("6 weeks");
    expect(view(answers).onboardingTimeline).toBe("2 days");
  });
  it("preserves both model economics and separate buying/onboarding observations", () => {
    const answers = normalizeDfySalesAnswers({ salesModel: "both", buyingMotion: "hybrid",
      customerValue: "USD 99/mo + USD 5,000 setup", billingBasis: "mixed", buyingTimeline: "Instant self-serve; 3 weeks sales-led", onboardingTimeline: "1 hour" });
    expect(answers.sales_model).toBe("both");
    expect(answers.customer_value).toBe("USD 99/mo + USD 5,000 setup");
    expect(answers.buying_timeline).toBe("Instant self-serve; 3 weeks sales-led");
    expect(answers.onboarding_timeline).toBe("1 hour");
  });
  it("allows unknown timing without inventing a default", () => {
    expect(normalizeDfySalesAnswers({ salesModel: "subscription", buyingMotion: "unknown" }).buying_timeline).toBe("");
    expect(view(normalizeDfySalesAnswers({})).salesCycle).toBe("—");
  });
});