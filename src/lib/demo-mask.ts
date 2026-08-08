/**
 * Presentation-layer masking used while demo mode is on.
 * Never mutates stored data — it only rewrites what is rendered so real
 * customer identities don't leak during a screen-shared demo.
 */

const FIRST_NAMES = ["Avery", "Jordan", "Riley", "Casey", "Morgan", "Quinn", "Rowan", "Skyler", "Emerson", "Harper"];
const LAST_NAMES = ["Baker", "Carter", "Dawson", "Ellis", "Foster", "Grant", "Hayes", "Irving", "Jensen", "Keller"];
const COMPANIES = ["Northgate", "Blueharbor", "Silverline", "Crestview", "Ironwood", "Fairmount", "Lakeshore", "Redstone"];

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function maskName(name?: string | null): string {
  if (!name) return "Demo Contact";
  const h = hash(name);
  return `${FIRST_NAMES[h % FIRST_NAMES.length]} ${LAST_NAMES[(h >> 3) % LAST_NAMES.length]}`;
}

export function maskCompany(company?: string | null): string {
  if (!company) return "Demo Company";
  const h = hash(company);
  return `${COMPANIES[h % COMPANIES.length]} Group`;
}

export function maskEmail(email?: string | null): string {
  if (!email) return "contact@demo-outreign.com";
  const h = hash(email);
  const first = FIRST_NAMES[h % FIRST_NAMES.length].toLowerCase();
  const company = COMPANIES[(h >> 5) % COMPANIES.length].toLowerCase();
  return `${first}@${company}.com`;
}

/** Convenience wrapper: masks only when demo mode is active. */
export function maybeMask(active: boolean, kind: "name" | "email" | "company", value?: string | null): string {
  const raw = value ?? "";
  if (!active) return raw;
  if (kind === "name") return maskName(raw);
  if (kind === "email") return maskEmail(raw);
  return maskCompany(raw);
}
