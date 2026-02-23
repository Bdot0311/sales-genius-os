
# Fix Lead Search: Align Edge Function with PDL API Format

## Problem

Searches return 0 results because the `fetch-external-leads` edge function sends **empty strings** for every unused field to the Railway proxy. For example, searching for "Lawyer in United States" sends:

```text
{
  "job_title": "Lawyer",
  "location": "United States",
  "industry": "",           <-- empty string breaks query
  "company": "",             <-- empty string breaks query
  "company_size": "",        <-- empty string breaks query
  "seniority": "",           <-- empty string breaks query
  "limit": 10
}
```

The Railway proxy likely passes these empty strings into its PDL Elasticsearch query builder, producing a query that tries to match `""` against fields like `job_company_industry`, which returns zero results.

Additionally, the `keywords` array from the AI parser is never forwarded to Railway.

## Solution

### Changes to `supabase/functions/fetch-external-leads/index.ts`

**1. Strip empty/null fields from the request body**

Instead of always including every field with empty string defaults, only include fields that have actual values. This ensures the Railway proxy only builds query clauses for fields the user actually specified.

Before (broken):
```text
const requestBody = {
  job_title: jobTitle || '',
  location: filters.country || '',
  industry: normalizedIndustry,
  company: filters.company || '',
  company_size: filters.company_size || '',
  seniority: filters.seniority || '',
  limit,
};
```

After (fixed):
```text
const rawBody = {
  job_title: jobTitle,
  location: filters.country,
  industry: normalizedIndustry,
  company: filters.company,
  company_size: filters.company_size,
  seniority: filters.seniority,
  keywords: nonJobKeywords,  // forward remaining keywords
  limit,
};
// Remove empty/null/undefined values
const requestBody = Object.fromEntries(
  Object.entries(rawBody).filter(([_, v]) =>
    v !== null && v !== undefined && v !== ''
  )
);
```

**2. Add industry normalization map**

Map common user-friendly or AI-parsed industry names to PDL-compatible `job_company_industry` values:

| User Input | PDL Value |
|---|---|
| Law, Legal | legal services |
| AI, AI/ML, Machine Learning | computer software |
| SaaS, Software | computer software |
| Fintech, Finance | financial services |
| Healthcare, Health | hospital & health care |
| Marketing | marketing and advertising |
| Real Estate | real estate |
| Education, EdTech | education management |
| Crypto, Web3, Blockchain | information technology and services |
| E-commerce, Ecommerce | internet |
| Consulting | management consulting |
| Recruiting, Staffing, HR | staffing and recruiting |
| Insurance | insurance |
| Construction | construction |
| Automotive | automotive |
| Food, Restaurant | food & beverages |
| Media, Entertainment | media production |
| Telecom, Telecommunications | telecommunications |

**3. Forward non-job keywords to Railway**

Currently, keywords like `["Series A", "B2B"]` are checked for job titles but then discarded. The fix will:
- Extract job title keywords (as before)
- Forward remaining keywords to Railway as a `keywords` array so the proxy can use them for company description matching or other PDL fields

**4. Add seniority normalization**

Map seniority values to PDL's `job_title_levels` canonical values:

| User Input | PDL Value |
|---|---|
| C-Suite, C-Level, Executive | cxo |
| VP, Vice President | vp |
| Director | director |
| Manager | manager |
| Senior | senior |
| Entry, Junior | entry |
| Owner | owner |
| Partner | partner |

**5. Normalize company size to PDL format**

PDL uses exact ranges like `"1-10"`, `"11-50"`, `"51-200"`, `"201-500"`, `"501-1000"`, `"1001-5000"`, `"5001-10000"`, `"10001+"`. The fix will map common inputs to these canonical values.

## Files Modified

| File | Changes |
|---|---|
| `supabase/functions/fetch-external-leads/index.ts` | Remove empty string defaults; add industry/seniority/company-size normalization maps; forward keywords; clean request body |

## No UI Changes Needed

The frontend hook and table components already handle the response format correctly. The fix is entirely in how the request is constructed before sending to Railway.
