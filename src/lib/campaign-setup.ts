import { supabase } from "@/integrations/supabase/client";
import { Analytics } from "@/lib/analytics-events";


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

/**
 * Fired when a signed-in visitor asks for a campaign setup. One
 * CampaignSetupHost is mounted at the app root and opens the form, so the three
 * landing-page CTAs don't each need to carry dialog state.
 */
export const CAMPAIGN_SETUP_FORM_EVENT = "outreign:campaign-setup-form";

export interface CampaignSetupFormRequest {
  source: string;
  plan?: string | null;
  /** The logged click, so the submitted answers land on the same row. */
  requestId?: string | null;
}

export const openCampaignSetupForm = (detail: CampaignSetupFormRequest) => {
  window.dispatchEvent(new CustomEvent(CAMPAIGN_SETUP_FORM_EVENT, { detail }));
};

/**
 * The campaign setup CTA.
 *
 * A signed-in account gets the form — the questions a human needs before doing
 * the work, and the only path that alerts sales. A signed-out visitor gets the
 * booking page as before; the click is logged for attribution and nobody is
 * emailed about it, because a click with no name, no address and no answers is
 * not a request.
 */
export const openCampaignSetupBooking = async (
  source: string,
  plan?: string | null,
  options?: { signedIn?: boolean | null },
) => {
  if (options?.signedIn) {
    Analytics.freeLeadsCtaClicked(source, plan);
    const id = await logCampaignSetupRequest(source, plan);
    openCampaignSetupForm({ source, plan, requestId: id });
    return;
  }
  return openCampaignSetupBookingUrlFlow(source, plan);
};

/** Signed-out path: log the click, open Calendly with tracking. */
const openCampaignSetupBookingUrlFlow = async (source: string, plan?: string | null) => {
  // Track the click itself, before the async work — a slow network or a blocked
  // popup must never cost us the conversion event.
  Analytics.freeLeadsCtaClicked(source, plan);

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
