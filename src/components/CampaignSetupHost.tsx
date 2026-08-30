import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CAMPAIGN_SETUP_FORM_EVENT,
  type CampaignSetupFormRequest,
} from "@/lib/campaign-setup";

// Only pulled down when a signed-in visitor actually asks for a setup, so the
// landing page doesn't carry a form most visitors never open.
const CampaignSetupDialog = lazy(() =>
  import("@/components/CampaignSetupDialog").then((m) => ({ default: m.CampaignSetupDialog })),
);

/**
 * Listens for a campaign setup request and opens the form.
 *
 * Mounted once at the app root: the CTA lives in three different landing
 * sections, and none of them should have to own dialog state or pull the form
 * into their bundle.
 */
export function CampaignSetupHost() {
  const [request, setRequest] = useState<CampaignSetupFormRequest | null>(null);
  const [account, setAccount] = useState<{ email: string | null; name: string | null }>({
    email: null,
    name: null,
  });

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<CampaignSetupFormRequest>).detail;
      setRequest(detail ?? { source: "campaign_setup_form" });
      void supabase.auth.getUser().then(({ data }) => {
        setAccount({
          email: data.user?.email ?? null,
          name: (data.user?.user_metadata?.full_name as string | undefined) ?? null,
        });
      });
    };

    window.addEventListener(CAMPAIGN_SETUP_FORM_EVENT, onOpen);
    return () => window.removeEventListener(CAMPAIGN_SETUP_FORM_EVENT, onOpen);
  }, []);

  if (!request) return null;

  return (
    <Suspense fallback={null}>
      <CampaignSetupDialog
        open
        onOpenChange={(next) => {
          if (!next) setRequest(null);
        }}
        request={request}
        account={account}
      />
    </Suspense>
  );
}
