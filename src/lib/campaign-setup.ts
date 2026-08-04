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

/** Logs the request (best effort) and opens the booking page. */
export const openCampaignSetupBooking = async (source: string, plan?: string | null) => {
  const win = window.open("", "_blank", "noopener,noreferrer");
  await logCampaignSetupRequest(source, plan);
  if (win) win.location.href = CAMPAIGN_SETUP_BOOKING_URL;
  else window.open(CAMPAIGN_SETUP_BOOKING_URL, "_blank", "noopener,noreferrer");
};
