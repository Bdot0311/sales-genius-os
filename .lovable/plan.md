

# Fix Lead Enrichment: Make It Actually Work

## The Problem

When you click "Enrich Lead Data", PDL returns "no_match" because:

1. **Contact name is a job title** -- Your leads have "Founder" as the contact name (not an actual person name like "John Smith"). The function tries to split this into first/last name but "Founder" is a single word, so no name params are sent to PDL.
2. **LinkedIn URL may not be matching** -- The LinkedIn URL is present but the function sends it as `profile` param. If the URL format doesn't match what PDL expects (e.g., missing trailing slash, or it's a partial URL), the lookup fails silently.
3. **No email fallback** -- Without an email address, PDL has very little to identify a person with.
4. **No re-enrichment** -- Once a lead shows "enriched" or "failed" status, the Enrich button hides or the function doesn't retry intelligently.

## The Fix

### 1. Improve the `enrich-lead` Edge Function

**File: `supabase/functions/enrich-lead/index.ts`**

Changes:
- **Prioritize LinkedIn URL** as the strongest identifier -- clean and normalize it before sending to PDL (ensure it starts with `https://linkedin.com/in/...`)
- **Detect job-title-as-name** -- If contact_name is a single word that matches common titles (Founder, CEO, CTO, etc.), skip sending it as a name and rely on LinkedIn/email/company instead
- **Update contact_name from PDL results** -- If PDL returns a full name and the current contact_name looks like a job title, overwrite it with the real name
- **Extract more data** -- Pull phone numbers, personal emails (as fallback), location, skills, education from PDL person results
- **Better company enrichment fallback** -- If company website isn't set, try deriving domain from the email or LinkedIn company page
- **Always allow re-enrichment** -- Remove the guard that prevents re-enriching already enriched leads; instead, only update fields that PDL returns new data for

### 2. Update the Lead Detail Sheet UI

**File: `src/components/dashboard/LeadDetailSheet.tsx`**

Changes:
- **Always show the Enrich button** -- Remove the `enrichment_status !== 'enriched'` check so users can re-enrich leads to refresh data
- **Show "Re-Enrich" label** for already-enriched leads vs "Enrich Lead Data" for new ones
- **Display failure reason** -- When enrichment returns no_match, show a helpful message like "Not enough identifying data. Add an email or LinkedIn URL and try again."

### 3. Update Saved Leads Page

**File: `src/pages/SavedLeads.tsx`**

Changes:
- After enrichment, properly refresh the selected lead's data in the detail sheet so users immediately see updated fields

## Technical Details

### Improved PDL Person Enrichment Logic

```
1. Normalize LinkedIn URL (ensure https://www.linkedin.com/in/xxx format)
2. Build params priority: email > linkedin_url (profile) > name + company
3. Skip name params if contact_name is a known job title pattern
4. If PDL returns full_name and current name looks like a title, update contact_name
5. Extract: full_name, job_title, work_email, phone_numbers, linkedin_url, location, skills
```

### Known Job Title Patterns to Detect
Single-word titles like: Founder, CEO, CTO, CFO, COO, CMO, Director, Manager, Engineer, Designer, VP, President, Owner

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/enrich-lead/index.ts` | Improve PDL query logic, handle job-title-as-name, extract more fields |
| `src/components/dashboard/LeadDetailSheet.tsx` | Always show enrich button, add re-enrich label, show failure guidance |
| `src/pages/SavedLeads.tsx` | Minor: ensure enrichment refresh works correctly (already mostly works) |

