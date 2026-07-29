import { supabase } from "@/integrations/supabase/client";

export const CAMPAIGN_SETUP_BOOKING_URL = "https://calendly.com/bdotindustries/30min";

/**
 * Logs that a signed-in user asked for a done-for-you campaign setup.
 * Silently no-ops for signed-out visitors (landing page traffic).
 */
export const logCampaignSetupRequest = async (source: string, plan?: string | null) => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("campaign_setup_requests")
      .insert({ user_id: user.id, source: source.slice(0, 80), plan: plan ?? null })
      .select("id")
      .single();
    if (error) throw error;
    return data?.id ?? null;
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
