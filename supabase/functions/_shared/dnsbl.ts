// Domain-based blacklist (DBL) lookups, shared by the on-demand check and the
// nightly sweep so the two cannot answer differently about the same domain.
//
// OutReign sends through Gmail's IPs, so IP-based RBLs say nothing about the
// user — the DOMAIN is what carries their reputation and what gets listed.

import { dohQuery } from "./dns.ts";

export const DBLS: { name: string; zone: string }[] = [
  { name: "Spamhaus DBL", zone: "dbl.spamhaus.org" },
  { name: "SURBL multi", zone: "multi.surbl.org" },
  { name: "URIBL", zone: "multi.uribl.com" },
];

export type ListStatus = "listed" | "clean" | "unknown";

export interface DnsblResult {
  rbl_name: string;
  status: ListStatus;
  listed: boolean;
  detail: string;
}

/**
 * Several DNSBLs refuse queries from shared or datacenter resolvers (we query
 * via Cloudflare) and answer with a sentinel that is NOT a listing:
 *   127.255.255.x  Spamhaus "public resolver / error"
 *   127.0.0.1      URIBL/SURBL "query refused via public resolver"
 * Reading either as a listing would tell a user to tear down a healthy domain.
 */
const isBlockedSentinel = (a: string) => a.startsWith("127.255.255.") || a === "127.0.0.1";

/** Query every configured DBL for one domain. Never throws. */
export async function checkDomainAgainstDnsbls(domain: string): Promise<DnsblResult[]> {
  const target = domain.toLowerCase().replace(/^www\./, "");

  return await Promise.all(
    DBLS.map(async ({ name, zone }) => {
      const res = await dohQuery(`${target}.${zone}`, "A");

      if (res.status === 3) {
        // NXDOMAIN — the definitive "not listed" answer.
        return { rbl_name: name, status: "clean" as ListStatus, listed: false, detail: "Not listed" };
      }

      if (res.status === 0 && res.answers.length > 0) {
        if (res.answers.every(isBlockedSentinel)) {
          return {
            rbl_name: name,
            status: "unknown" as ListStatus,
            listed: false,
            detail: "Query refused by the DNSBL (public-resolver limit), not a listing",
          };
        }
        // A genuine listing uses codes >= 127.0.0.2. Report only the real codes.
        const realCodes = res.answers.filter((a) => !isBlockedSentinel(a));
        return {
          rbl_name: name,
          status: "listed" as ListStatus,
          listed: true,
          detail: `Listed: ${realCodes.join(", ")}`,
        };
      }

      // Honesty: an unresolvable lookup is unknown, never a false clean.
      return { rbl_name: name, status: "unknown" as ListStatus, listed: false, detail: "No definitive answer" };
    }),
  );
}

/** Determinate results only — an `unknown` is not worth persisting as history. */
export function persistableRows(
  results: DnsblResult[],
  userId: string,
  target: string,
): Record<string, unknown>[] {
  return results
    .filter((r) => r.status !== "unknown")
    .map((r) => ({
      user_id: userId,
      target,
      target_type: "domain",
      rbl_name: r.rbl_name,
      listed: r.listed,
      detail: r.detail,
    }));
}
