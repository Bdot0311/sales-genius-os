/** A user preference, never an authorization claim or a Mailchimp subscription. */
export function marketingConsentRecord(optedIn: boolean, recordedAt: string) {
  return { opted_in: optedIn === true, recorded_at: recordedAt, source: "onboarding", version: "2026-11-21", scope: ["promotions", "product_updates", "blog_newsletters"] };
}

export function hasMarketingConsent(metadata: Record<string, unknown> | undefined): boolean {
  const record = metadata?.marketing_email_consent;
  return typeof record === "object" && record !== null && "opted_in" in record && record.opted_in === true;
}