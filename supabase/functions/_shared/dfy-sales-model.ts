/** Shared public-form normalization; legacy applications remain readable. */
export const SALES_MODELS = [
  { value: "subscription", label: "SaaS / subscription" },
  { value: "high_ticket", label: "High-ticket / one-time sale" },
  { value: "both", label: "Subscriptions and high-ticket sales" },
  { value: "other", label: "Other" },
];
export const BUYING_MOTIONS = [
  { value: "self_serve", label: "Self-serve signup / checkout" },
  { value: "sales_led", label: "Sales-led / demo / proposal" },
  { value: "hybrid", label: "Self-serve and sales-led" },
  { value: "unknown", label: "Not established yet" },
];
export const BILLING_BASES = [
  { value: "monthly", label: "Per month" },
  { value: "annual", label: "Per year" },
  { value: "one_time", label: "One-time / project" },
  { value: "usage", label: "Usage-based" },
  { value: "mixed", label: "Mixed — specify in value" },
];
const choice = (value: unknown, options: { value: string }[]) =>
  typeof value === "string" && options.some((o) => o.value === value) ? value : "unspecified";
const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 300) : "";

export function normalizeDfySalesAnswers(body: Record<string, unknown>) {
  const salesModel = choice(body.salesModel, SALES_MODELS);
  const buyingMotion = choice(body.buyingMotion, BUYING_MOTIONS);
  return {
    sales_model: salesModel,
    buying_motion: buyingMotion,
    customer_value: text(body.customerValue),
    billing_basis: choice(body.billingBasis, BILLING_BASES),
    // Self-serve has no rep-led cycle; activation is captured separately.
    buying_timeline: buyingMotion === "self_serve" ? "" : text(body.buyingTimeline),
    onboarding_timeline: salesModel === "subscription" || salesModel === "both" || buyingMotion === "self_serve"
      ? text(body.onboardingTimeline) : "",
  };
}