

# Full REST API for SalesOS + Updated API Documentation

## Overview
Build a comprehensive REST API that lets third-party apps (Zapier, Make, Clay, AI tools, custom scripts) perform **any action** in SalesOS -- not just import leads, but also manage deals, activities, contacts, workflows, and outreach. Then rewrite the API docs page to reference only these real, functional endpoints.

## What Exists Today
- **GraphQL API** (read-only): queries leads, deals, activities
- **API key infrastructure**: generation, rate limiting, usage logging, caching
- **API docs page**: references fake `https://api.salesos.com` with non-existent REST endpoints

## What Will Be Built

### Part 1: REST API Backend Function

A single backend function (`supabase/functions/rest-api/index.ts`) that handles full CRUD operations across all major SalesOS resources. Authenticated via `X-API-Key` header, reusing existing API key validation and rate limiting.

#### Supported Endpoints

**Leads**
| Method | Route | Description |
|--------|-------|-------------|
| GET | /leads | List leads (filter by industry, status, limit, offset) |
| POST | /leads | Create a single lead |
| POST | /leads/bulk | Bulk import up to 100 leads |
| GET | /leads/:id | Get a specific lead |
| PATCH | /leads/:id | Update a lead |
| DELETE | /leads/:id | Delete a lead |

**Deals**
| Method | Route | Description |
|--------|-------|-------------|
| GET | /deals | List deals (filter by stage, limit, offset) |
| POST | /deals | Create a deal |
| GET | /deals/:id | Get a specific deal |
| PATCH | /deals/:id | Update a deal (change stage, value, etc.) |
| DELETE | /deals/:id | Delete a deal |

**Activities**
| Method | Route | Description |
|--------|-------|-------------|
| GET | /activities | List activities (filter by type, limit, offset) |
| POST | /activities | Create an activity (task, call, email, note) |
| PATCH | /activities/:id | Update an activity (mark complete, reschedule) |
| DELETE | /activities/:id | Delete an activity |

**Contacts**
| Method | Route | Description |
|--------|-------|-------------|
| GET | /contacts | List contacts (filter by status, limit, offset) |
| POST | /contacts | Create a contact |
| GET | /contacts/:id | Get a specific contact |
| PATCH | /contacts/:id | Update a contact |
| DELETE | /contacts/:id | Delete a contact |

**Workflows**
| Method | Route | Description |
|--------|-------|-------------|
| GET | /workflows | List workflows |
| POST | /workflows/:id/execute | Trigger a workflow execution |
| PATCH | /workflows/:id | Toggle workflow active/inactive |

**Outreach**
| Method | Route | Description |
|--------|-------|-------------|
| POST | /email/generate | Generate an AI email draft for a lead |
| POST | /leads/:id/enrich | Trigger lead enrichment |
| POST | /leads/:id/score | Trigger lead scoring |

#### Security
- Validates `X-API-Key` header against the `api_keys` table
- Checks key is active and not expired
- Calls existing `check-rate-limit` function
- Scopes ALL queries to the API key owner's `user_id` (no cross-user access)
- Input validation: field length limits, type checks, max 100 items per bulk call
- Logs every request to `api_usage_log`
- Returns rate limit info in response headers

#### Bulk Import Format
```text
POST /rest-api/leads/bulk
X-API-Key: sk_xxx

{
  "leads": [
    { "contact_name": "Jane Doe", "company_name": "Acme Corp", "contact_email": "jane@acme.com" },
    { "contact_name": "Bob Smith", "company_name": "TechCo", "job_title": "CTO" }
  ]
}

Response: { "imported": 2, "failed": 0, "leads": [...] }
```

### Part 2: Rewrite API Documentation Page

Completely replace all fake data in `src/pages/ApiDocs.tsx`:

- **Base URL**: Replace `https://api.salesos.com` with the real dynamic URL constructed from the environment variable
- **Endpoints**: Replace the 3 fake endpoints with ALL real REST API endpoints listed above, organized by resource (Leads, Deals, Activities, Contacts, Workflows, Outreach)
- **Code examples**: Update all 4 languages (JavaScript, Python, cURL, PHP) with real REST examples
- **Response format**: Show actual response shapes with pagination and rate limit headers
- **Add "Third-Party Integration" section**: Quick-start guides for connecting Zapier, Make, n8n, Python scripts, and AI tools
- **Keep accurate sections**: Webhook signature verification, rate limit headers, authentication via X-API-Key

### Part 3: Register New Function

Add `rest-api` to `supabase/config.toml` with `verify_jwt = false` (uses API key auth instead of JWT).

## Files

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/rest-api/index.ts` | Create | Full REST API with CRUD for leads, deals, activities, contacts, workflows, outreach |
| `src/pages/ApiDocs.tsx` | Rewrite | Replace all fake endpoints with real REST API documentation |

No database changes needed -- the REST API writes to existing tables (`leads`, `deals`, `activities`, `contacts`, `workflows`) using the service role client, scoped by the API key owner's `user_id`.

