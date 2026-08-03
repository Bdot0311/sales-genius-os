/**
 * The vocabulary the lead-search pipeline actually understands.
 *
 * Every layer used to keep its own copy of these maps — fetch-external-leads,
 * the regex fallback in Leads.tsx, and the backend — so a value one layer
 * considered valid could be silently dropped by the next. parse-lead-query had
 * no copy at all: it asked an LLM for free-form industries and sizes, and
 * anything outside the pipeline's vocabulary matched nothing upstream.
 *
 * Normalisation is deterministic and lives here so the parser can only emit
 * values the search will honour. Industry reaches Crustdata as a substring
 * match against company_industries, so it has to be a real taxonomy value;
 * company size is parsed numerically from "N-M" or "N+", so word buckets like
 * "enterprise" have to be resolved to a range before they leave here.
 */

// Industry normalization map (user-friendly → PDL canonical)
export const INDUSTRY_MAP: Record<string, string> = {
  'law': 'legal services', 'legal': 'legal services', 'legal services': 'legal services',
  'ai': 'computer software', 'ai/ml': 'computer software', 'machine learning': 'computer software',
  'saas': 'computer software', 'software': 'computer software', 'tech': 'information technology and services',
  'fintech': 'financial services', 'finance': 'financial services', 'banking': 'banking',
  'healthcare': 'hospital & health care', 'health': 'hospital & health care', 'medical': 'hospital & health care',
  'marketing': 'marketing and advertising', 'advertising': 'marketing and advertising',
  'real estate': 'real estate', 'realestate': 'real estate',
  'education': 'education management', 'edtech': 'education management',
  'crypto': 'information technology and services', 'web3': 'information technology and services', 'blockchain': 'information technology and services',
  'e-commerce': 'internet', 'ecommerce': 'internet',
  'consulting': 'management consulting',
  'recruiting': 'staffing and recruiting', 'staffing': 'staffing and recruiting', 'hr': 'staffing and recruiting',
  'insurance': 'insurance',
  'construction': 'construction',
  'automotive': 'automotive',
  'food': 'food & beverages', 'restaurant': 'food & beverages',
  'media': 'media production', 'entertainment': 'media production',
  'telecom': 'telecommunications', 'telecommunications': 'telecommunications',
  'logistics': 'logistics and supply chain', 'supply chain': 'logistics and supply chain',
  'manufacturing': 'manufacturing',
  'retail': 'retail',
  'energy': 'oil & energy', 'oil': 'oil & energy',
  'government': 'government administration',
  'nonprofit': 'nonprofit organization management', 'ngo': 'nonprofit organization management',
};

// Country name → ISO 2-letter code map
export const COUNTRY_MAP: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'us': 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'america': 'US',
  // US cities/states → country code (location filter will be dropped if Railway doesn't understand city)
  'new york': 'US', 'california': 'US', 'san francisco': 'US', 'silicon valley': 'US',
  'los angeles': 'US', 'chicago': 'US', 'austin': 'US', 'boston': 'US', 'seattle': 'US',
  'miami': 'US', 'denver': 'US', 'atlanta': 'US', 'dallas': 'US', 'houston': 'US',
  'new york city': 'US', 'nyc': 'US', 'sf': 'US', 'la': 'US',
  'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB', 'britain': 'GB',
  'london': 'GB', 'manchester': 'GB', 'edinburgh': 'GB',
  'canada': 'CA', 'toronto': 'CA', 'vancouver': 'CA', 'montreal': 'CA',
  'australia': 'AU', 'sydney': 'AU', 'melbourne': 'AU',
  'germany': 'DE', 'berlin': 'DE', 'munich': 'DE', 'hamburg': 'DE',
  'france': 'FR', 'paris': 'FR', 'spain': 'ES', 'madrid': 'ES', 'barcelona': 'ES',
  'italy': 'IT', 'rome': 'IT', 'milan': 'IT',
  'netherlands': 'NL', 'amsterdam': 'NL', 'sweden': 'SE', 'stockholm': 'SE',
  'norway': 'NO', 'denmark': 'DK', 'copenhagen': 'DK',
  'switzerland': 'CH', 'zurich': 'CH', 'austria': 'AT', 'vienna': 'AT',
  'belgium': 'BE', 'brussels': 'BE', 'ireland': 'IE', 'dublin': 'IE',
  'india': 'IN', 'bangalore': 'IN', 'mumbai': 'IN', 'delhi': 'IN', 'hyderabad': 'IN',
  'singapore': 'SG', 'israel': 'IL', 'tel aviv': 'IL',
  'brazil': 'BR', 'são paulo': 'BR', 'sao paulo': 'BR', 'rio de janeiro': 'BR',
  'mexico': 'MX', 'mexico city': 'MX',
  'argentina': 'AR', 'buenos aires': 'AR', 'colombia': 'CO', 'bogota': 'CO',
  'chile': 'CL', 'santiago': 'CL',
  'japan': 'JP', 'tokyo': 'JP', 'osaka': 'JP',
  'south korea': 'KR', 'korea': 'KR', 'seoul': 'KR',
  'china': 'CN', 'beijing': 'CN', 'shanghai': 'CN', 'taiwan': 'TW', 'taipei': 'TW',
  'new zealand': 'NZ', 'auckland': 'NZ',
  'south africa': 'ZA', 'cape town': 'ZA', 'johannesburg': 'ZA',
  'nigeria': 'NG', 'lagos': 'NG', 'kenya': 'KE', 'nairobi': 'KE',
  'poland': 'PL', 'warsaw': 'PL', 'portugal': 'PT', 'lisbon': 'PT',
  'czech republic': 'CZ', 'czechia': 'CZ', 'prague': 'CZ',
  'finland': 'FI', 'helsinki': 'FI', 'romania': 'RO', 'bucharest': 'RO',
  'hungary': 'HU', 'budapest': 'HU', 'ukraine': 'UA', 'kyiv': 'UA',
  'uae': 'AE', 'united arab emirates': 'AE', 'dubai': 'AE', 'abu dhabi': 'AE',
  'saudi arabia': 'SA', 'riyadh': 'SA', 'turkey': 'TR', 'istanbul': 'TR',
  'russia': 'RU', 'moscow': 'RU',
};

export function normalizeCountry(raw: string): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  return COUNTRY_MAP[lower] || raw.trim();
}


// Seniority normalization map
export const SENIORITY_MAP: Record<string, string> = {
  'c-suite': 'cxo', 'c-level': 'cxo', 'executive': 'cxo', 'csuite': 'cxo', 'clevel': 'cxo',
  'vp': 'vp', 'vice president': 'vp',
  'director': 'director',
  'manager': 'manager',
  'senior': 'senior',
  'entry': 'entry', 'junior': 'entry',
  'owner': 'owner',
  'partner': 'partner',
};

// Company size normalization to PDL ranges
export const COMPANY_SIZE_MAP: Record<string, string> = {
  '1-10': '1-10', 'micro': '1-10',
  '11-50': '11-50', 'small': '11-50',
  '51-200': '51-200', 'medium': '51-200',
  '201-500': '201-500',
  '501-1000': '501-1000', 'large': '501-1000',
  '1001-5000': '1001-5000',
  '5001-10000': '5001-10000', 'enterprise': '5001-10000',
  '10001+': '10001+', 'mega': '10001+',
};

// Normalize industry value to PDL-compatible format
export function normalizeIndustry(raw: string): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  // Check exact match first
  if (INDUSTRY_MAP[lower]) return INDUSTRY_MAP[lower];
  // Check if any key is contained in the input
  for (const [key, value] of Object.entries(INDUSTRY_MAP)) {
    if (lower.includes(key)) return value;
  }
  // If no match, pass through as-is (Railway/PDL may still match it)
  return raw.trim();
}


// Normalize seniority value to PDL-compatible format
export function normalizeSeniority(raw: string): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  return SENIORITY_MAP[lower] || raw.trim();
}


// Normalize company size to PDL range format
export function normalizeCompanySize(raw: string): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  if (COMPANY_SIZE_MAP[lower]) return COMPANY_SIZE_MAP[lower];
  // Try to match numeric patterns like "201-500" already in correct format
  if (/^\d+[-–]\d+$/.test(raw.trim()) || /^\d+\+$/.test(raw.trim())) return raw.trim();
  return raw.trim();
}

