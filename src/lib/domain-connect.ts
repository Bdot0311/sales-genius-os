// DomainConnect — the free open standard (by GoDaddy/IONOS) for applying DNS records
// without the user manually editing their zone. Docs: https://www.domainconnect.org
//
// Flow:
//   1. Discover the domain's DNS provider via a TXT record at _domainconnect.<domain>
//   2. Fetch that provider's /settings endpoint to learn if the synchronous ("Do It For Me")
//      flow is supported and where to send the user.
//   3. Build an apply URL pointing at OUR registered template; the provider shows the user a
//      confirm screen and writes the records.
//
// The template referenced by SERVICE_PROVIDER_ID / SERVICE_ID below must be registered in the
// public DomainConnect template registry (see domain-connect-templates/README.md in this repo).

// Our registered DomainConnect service provider + service template identifiers.
// Update these once the template PR is merged into the registry.
export const SERVICE_PROVIDER_ID =
  import.meta.env.VITE_DOMAINCONNECT_PROVIDER_ID || "outreign.io";
export const SERVICE_ID =
  import.meta.env.VITE_DOMAINCONNECT_SERVICE_ID || "email-auth";

export interface DnsRecordSpec {
  type: string;
  host: string;
  value: string;
}

export interface DomainConnectSettings {
  providerId: string;
  providerName?: string;
  urlSyncUX?: string;
  urlAPI?: string;
  urlControlPanel?: string;
  width?: number;
  height?: number;
}

export type DiscoveryResult =
  | { supported: true; settings: DomainConnectSettings }
  | { supported: false; reason: "no_record" | "no_settings" | "no_sync" | "error" };

// DNS-over-HTTPS TXT lookup (CORS-safe, runs in the browser).
async function dohTxt(name: string): Promise<string[]> {
  try {
    const r = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
      { headers: { Accept: "application/dns-json" } }
    );
    if (!r.ok) return [];
    const data = await r.json();
    return (data.Answer || []).map((a: any) => a.data.replace(/^"|"$/g, ""));
  } catch {
    return [];
  }
}

// Step 1 + 2: discover whether the domain's DNS host supports the synchronous apply flow.
export async function discoverDomainConnect(domain: string): Promise<DiscoveryResult> {
  try {
    const txts = await dohTxt(`_domainconnect.${domain}`);
    const apiHost = txts[0]?.trim();
    if (!apiHost) return { supported: false, reason: "no_record" };

    const settingsUrl = `https://${apiHost}/v2/${encodeURIComponent(domain)}/settings`;
    const res = await fetch(settingsUrl);
    if (!res.ok) return { supported: false, reason: "no_settings" };

    const settings: DomainConnectSettings = await res.json();
    if (!settings.urlSyncUX) return { supported: false, reason: "no_sync" };

    return { supported: true, settings };
  } catch {
    return { supported: false, reason: "error" };
  }
}

// Step 3: build the apply URL the user is sent to. Template variables are passed as query params.
export function buildApplyUrl(
  settings: DomainConnectSettings,
  domain: string,
  variables: Record<string, string>,
  redirectUri?: string
): string {
  const base = settings.urlSyncUX!.replace(/\/$/, "");
  const params = new URLSearchParams({ domain });
  for (const [k, v] of Object.entries(variables)) {
    if (v) params.set(k, v);
  }
  if (redirectUri) params.set("redirect_uri", redirectUri);

  return `${base}/v2/domainTemplates/providers/${SERVICE_PROVIDER_ID}/services/${SERVICE_ID}/apply?${params.toString()}`;
}
