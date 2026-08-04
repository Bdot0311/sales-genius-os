import { supabase } from "@/integrations/supabase/client";

export const CAMPAIGN_SETUP_BOOKING_URL = "https://calendly.com/bdotindustries/30min";

/**
 * Logs that someone asked for a done-for-you campaign setup.
 * Works for signed-out landing-page visitors too — the edge function records
 * the click server-side and alerts sales, so a booking is never missed.
 */
export const logCampaignSetupRequest = async (source: string, plan?: string | null) => {
  try {
    const { data, error } = await supabase.functions.invoke("log-campaign-setup-request", {
      body: {
        source: source.slice(0, 80),
        plan: plan ?? null,
        path: window.location.pathname,
        referrer: document.referrer || null,
      },
    });
    if (error) throw error;
    return (data as { id?: string } | null)?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * Builds the Calendly link with tracking + prefill so the Calendly webhook can
 * attribute the booked meeting back to the exact click that produced it.
 */
export const buildCampaignSetupBookingUrl = (
  requestId?: string | null,
  prefill?: { name?: string | null; email?: string | null },
) => {
  const url = new URL(CAMPAIGN_SETUP_BOOKING_URL);
  if (requestId) url.searchParams.set("utm_content", requestId);
  url.searchParams.set("utm_source", "outreign");
  url.searchParams.set("utm_campaign", "campaign-setup");
  if (prefill?.name) url.searchParams.set("name", prefill.name);
  if (prefill?.email) url.searchParams.set("email", prefill.email);
  return url.toString();
};

/** Logs the request (best effort) and opens the booking page with tracking. */
export const openCampaignSetupBooking = async (source: string, plan?: string | null) => {
  const win = window.open("", "_blank", "noopener,noreferrer");

  let prefill: { name?: string | null; email?: string | null } | undefined;
  try {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      prefill = {
        email: data.user.email ?? null,
        name: (data.user.user_metadata?.full_name as string | undefined) ?? null,
      };
    }
  } catch {
    /* signed out — keep the booking anonymous */
  }

  const id = await logCampaignSetupRequest(source, plan);
  const target = buildCampaignSetupBookingUrl(id, prefill);
  if (win) win.location.href = target;
  else window.open(target, "_blank", "noopener,noreferrer");
};
