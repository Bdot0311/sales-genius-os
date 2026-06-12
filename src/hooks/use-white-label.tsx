import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface WhiteLabelSettings {
  company_name: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  custom_domain?: string | null;
  domain_verification_token?: string | null;
  domain_verified?: boolean;
  referral_code?: string | null;
}

const hexToHSL = (hex: string): string | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
};

const applyWhiteLabel = (data: WhiteLabelSettings) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (data.primary_color) {
    const hsl = hexToHSL(data.primary_color);
    if (hsl) root.style.setProperty("--primary", hsl);
  }
  if (data.secondary_color) {
    const hsl = hexToHSL(data.secondary_color);
    if (hsl) root.style.setProperty("--secondary", hsl);
  }
  if (data.accent_color) {
    const hsl = hexToHSL(data.accent_color);
    if (hsl) root.style.setProperty("--accent", hsl);
  }
};

const OWN_DOMAINS = ["salesos.alephwavex.io", "localhost", "127.0.0.1"];

export const useWhiteLabel = () => {
  const [settings, setSettings] = useState<WhiteLabelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // true when the app is running on an agency's custom domain
  const [isCustomDomain, setIsCustomDomain] = useState(false);
  // true when a logged-in user is a client under an agency
  const [isAgencyClient, setIsAgencyClient] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const hostname = typeof window !== "undefined" ? window.location.hostname : "";
      const isAgencyDomain = !!hostname && !OWN_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));

      // ── Custom domain ──────────────────────────────────────────────────────
      // When the app is served from app.theiragency.com (a verified custom domain
      // set by an agency owner), load that agency's branding globally — regardless
      // of who is logged in. OutReign branding is completely hidden on these domains.
      if (isAgencyDomain) {
        const { data: domainWl } = await supabase
          .from("white_label_settings")
          .select("*")
          .eq("custom_domain", hostname)
          .eq("domain_verified", true)
          .maybeSingle();

        if (domainWl) {
          setSettings(domainWl);
          applyWhiteLabel(domainWl);
          setIsCustomDomain(true);
          setLoading(false);
          return;
        }
      }

      // ── Logged-in user ─────────────────────────────────────────────────────
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // If this user is an active client under an agency, load the agency's
      // branding so the entire dashboard looks like the agency's own product.
      const { data: agencyLink } = await supabase
        .from("agency_clients")
        .select("agency_id")
        .eq("client_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      const targetUserId = agencyLink?.agency_id ?? user.id;
      setIsAgencyClient(!!agencyLink);

      const { data, error: fetchError } = await supabase
        .from("white_label_settings")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (fetchError) {
        setError(fetchError);
      } else if (data) {
        setSettings(data);
        applyWhiteLabel(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const updateSettings = useCallback(async (newSettings: Partial<WhiteLabelSettings>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error: updateError } = await supabase
        .from("white_label_settings")
        .upsert({ user_id: user.id, ...newSettings })
        .select()
        .single();

      if (updateError) throw updateError;
      setSettings(data);
      applyWhiteLabel(data);
      return { success: true };
    } catch (err) {
      return { success: false, error: err };
    }
  }, []);

  return { settings, loading, error, isCustomDomain, isAgencyClient, updateSettings, reload: loadSettings };
};
