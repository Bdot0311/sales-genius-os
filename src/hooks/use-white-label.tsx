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
}

// Helper function to convert hex to HSL
const hexToHSL = (hex: string): string | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
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

// Apply white label settings to CSS variables
const applyWhiteLabel = (data: WhiteLabelSettings) => {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  
  if (data.primary_color) {
    const hsl = hexToHSL(data.primary_color);
    if (hsl) root.style.setProperty('--primary', hsl);
  }
  
  if (data.secondary_color) {
    const hsl = hexToHSL(data.secondary_color);
    if (hsl) root.style.setProperty('--secondary', hsl);
  }
  
  if (data.accent_color) {
    const hsl = hexToHSL(data.accent_color);
    if (hsl) root.style.setProperty('--accent', hsl);
  }
};

export const useWhiteLabel = () => {
  const [settings, setSettings] = useState<WhiteLabelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("white_label_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchError) {
        console.error("Error loading white label settings:", fetchError);
        setError(fetchError);
      } else if (data) {
        setSettings(data);
        applyWhiteLabel(data);
      }
    } catch (err) {
      console.error("Error loading white label settings:", err);
      setError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const updateSettings = useCallback(async (newSettings: Partial<WhiteLabelSettings>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error: updateError } = await supabase
        .from("white_label_settings")
        .upsert({
          user_id: user.id,
          ...newSettings
        })
        .select()
        .single();

      if (updateError) throw updateError;

      setSettings(data);
      applyWhiteLabel(data);
      return { success: true };
    } catch (err) {
      console.error("Error updating white label settings:", err);
      return { success: false, error: err };
    }
  }, []);

  return { settings, loading, error, updateSettings, reload: loadSettings };
};
