# SalesOS - Project Status & Implementation Plan

> Last Updated: 2025-12-31  
> Status: 🟡 In Development (Core Complete, Lead Search Blocked)

---

## 📋 Executive Summary

SalesOS is a B2B sales lead generation and CRM platform with AI-powered prospect discovery, pipeline management, automations, and Stripe billing. The core application is functional but **lead search is blocked due to exhausted PDL (People Data Labs) credits**.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React/Vite)                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │Waitlist │ │Dashboard│ │Pipeline │ │AI Coach │ │Settings │   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘   │
└───────┼──────────┼──────────┼──────────┼──────────┼─────────────┘
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (Lovable Cloud)                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │  Auth   │ │   DB    │ │ Storage │ │  Edge   │               │
│  │         │ │ Tables  │ │ Buckets │ │Functions│               │
│  └─────────┘ └─────────┘ └─────────┘ └────┬────┘               │
└────────────────────────────────────────────┼────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   EXTERNAL SERVICES                              │
│  ┌─────────────────┐  ┌─────────┐  ┌─────────┐                 │
│  │ Railway Proxy   │  │ Stripe  │  │ Resend  │                 │
│  │ (PDL API)       │  │ Billing │  │ Email   │                 │
│  └────────┬────────┘  └─────────┘  └─────────┘                 │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ People Data Labs│◄── BLOCKED: Credits Exhausted              │
│  │ (Lead Search)   │                                            │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🚨 CRITICAL ISSUES (Blockers)

### Issue #1: PDL Search Credits Exhausted
**Status:** 🔴 BLOCKING  
**Impact:** Lead search returns empty results  
**Files Affected:**
- `supabase/functions/fetch-external-leads/index.ts` (lines 329-336)
- `src/hooks/use-external-leads.tsx` (lines 66-74)
- `src/pages/Leads.tsx` (lines 75-141)

**Root Cause:**
The Railway proxy at `RAILWAY_LEADS_API_URL` calls People Data Labs (PDL) API for lead searches. PDL search credits are exhausted, returning 402 Payment Required.

**Evidence:**
- Railway has a `cached_searches` table with previous search results
- Edge function correctly handles 402 but cannot retrieve cached data
- Railway's `/cache/stats` endpoint only returns counts, not actual data

**Solutions (Pick One):**
| Solution | Effort | Description |
|----------|--------|-------------|
| **A. Add PDL Credits** | Low | Purchase more PDL search credits |
| **B. Direct Cache Query** | Medium | Add `RAILWAY_SUPABASE_URL` + `RAILWAY_SUPABASE_KEY` secrets to query Railway's cached_searches table directly |
| **C. Railway Endpoint** | Medium | Add `/cache/search` endpoint to Railway proxy that returns cached results |
| **D. Mock Data Mode** | Low | Fallback to demo data when credits exhausted (for demos only) |

**Recommended:** Solution B - Direct Cache Query

**Implementation Steps for Solution B:**
1. Add secrets:
   ```
   RAILWAY_SUPABASE_URL = [Railway project's Supabase URL]
   RAILWAY_SUPABASE_KEY = [Railway project's Supabase anon key]
   ```
2. Update `fetch-external-leads/index.ts` to:
   - Create Supabase client for Railway's database
   - Query `cached_searches` table on 402 or empty results
   - Return cached leads with "from_cache: true" flag

---

## ⚠️ WARNINGS (Non-Blocking)

### Warning #1: Extension in Public Schema
**Status:** 🟡 Warning  
**Impact:** Security best practice violation  
**Source:** Supabase Linter  
**Fix:** Move extensions from `public` schema to a dedicated `extensions` schema  
**Documentation:** https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

### Warning #2: React Router v6 Deprecation Warnings
**Status:** 🟡 Warning  
**Impact:** Will break in v7  
**Files:** `src/App.tsx`  
**Warnings:**
- `v7_startTransition` flag not set
- `v7_relativeSplatPath` flag not set

**Fix:**
```tsx
// In src/App.tsx, update BrowserRouter:
<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
```

### Warning #3: Tailwind CDN in Production
**Status:** 🟡 Warning  
**Impact:** Performance degradation  
**Note:** This may be from preview environment, not production build

---

## 📁 Key Files & Locations

### Edge Functions (`supabase/functions/`)
| Function | Purpose | Status |
|----------|---------|--------|
| `fetch-external-leads` | Fetches leads from Railway/PDL | 🔴 Blocked (no credits) |
| `parse-lead-query` | AI parses natural language queries | ✅ Working |
| `enrich-lead` | Enriches lead data | ✅ Working |
| `score-lead` | AI scores lead quality | ✅ Working |
| `ai-coach` | AI sales coaching | ✅ Working |
| `generate-email` | AI email generation | ✅ Working |
| `create-checkout` | Stripe checkout | ✅ Working |
| `check-subscription` | Verify user subscription | ✅ Working |
| `execute-workflow` | Run automations | ✅ Working |

### Core Pages (`src/pages/`)
| Page | Route | Status |
|------|-------|--------|
| Waitlist | `/` | ✅ Live |
| Landing | `/home` | ✅ Ready |
| Auth | `/auth` | ✅ Working |
| Dashboard | `/dashboard` | ✅ Working |
| Leads | `/dashboard/leads` | 🔴 Blocked (search) |
| Saved Leads | `/dashboard/leads/saved` | ✅ Working |
| Pipeline | `/dashboard/pipeline` | ✅ Working |
| Coach | `/dashboard/coach` | ✅ Working |
| Analytics | `/dashboard/analytics` | ✅ Working |
| Automations | `/dashboard/automations` | ✅ Working |
| Settings | `/settings` | ✅ Working |
| Admin | `/admin/*` | ✅ Working |

### Hooks (`src/hooks/`)
| Hook | Purpose | Status |
|------|---------|--------|
| `use-external-leads` | External lead search | 🔴 Returns empty |
| `use-subscription` | User subscription state | ✅ Working |
| `use-plan-features` | Feature gating by plan | ✅ Working |
| `use-leads-usage` | Lead quota tracking | ✅ Working |
| `use-admin` | Admin role detection | ✅ Working |

---

## 🗄️ Database Tables

### Core Tables
| Table | RLS | Status |
|-------|-----|--------|
| `profiles` | ✅ | Working |
| `leads` | ✅ | Working |
| `deals` | ✅ | Working |
| `activities` | ✅ | Working |
| `companies` | ✅ | Working |
| `contacts` | ✅ | Working |
| `subscriptions` | ✅ | Working |
| `workflows` | ✅ | Working |
| `webhooks` | ✅ | Working |

### Admin Tables
| Table | RLS | Status |
|-------|-----|--------|
| `user_roles` | ✅ | Working |
| `audit_logs` | ✅ | Working |
| `admin_settings` | ✅ | Working |
| `feature_flags` | ✅ | Working |

---

## 🔧 Required Secrets

| Secret | Status | Purpose |
|--------|--------|---------|
| `SUPABASE_URL` | ✅ Configured | Supabase connection |
| `SUPABASE_ANON_KEY` | ✅ Configured | Supabase public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Configured | Supabase admin operations |
| `STRIPE_SECRET_KEY` | ✅ Configured | Payment processing |
| `RESEND_API_KEY` | ✅ Configured | Email sending |
| `PDL_API_KEY` | ✅ Configured | Lead enrichment |
| `RAILWAY_LEADS_API_URL` | ✅ Configured | External lead search |
| `LOVABLE_API_KEY` | ✅ Configured | AI features |
| `RAILWAY_SUPABASE_URL` | ❌ Missing | Query Railway cache |
| `RAILWAY_SUPABASE_KEY` | ❌ Missing | Query Railway cache |

---

## 📝 TODO Checklist

### Critical Priority
- [ ] **Fix lead search** (blocked by PDL credits)
  - [ ] Add `RAILWAY_SUPABASE_URL` secret
  - [ ] Add `RAILWAY_SUPABASE_KEY` secret
  - [ ] Update `fetch-external-leads` to query cached results
  - [ ] Test end-to-end lead search flow

### High Priority
- [ ] Add React Router v7 future flags
- [ ] Test complete user journey (signup → search → save → pipeline)
- [ ] Verify Stripe checkout/subscription flow
- [ ] Test email sending (waitlist confirmation, etc.)

### Medium Priority
- [ ] Move database extensions to dedicated schema
- [ ] Add error boundaries to key components
- [ ] Implement lead export functionality
- [ ] Add bulk lead actions (select all, bulk delete)

### Low Priority
- [ ] Add more detailed analytics charts
- [ ] Implement lead assignment to team members
- [ ] Add custom fields for leads
- [ ] Implement lead deduplication

---

## 🚀 Launch Checklist

Before moving from waitlist to full launch:

- [ ] PDL credits replenished OR cache fallback implemented
- [ ] Stripe products/prices configured
- [ ] Email templates tested
- [ ] Admin user created
- [ ] Feature flags configured
- [ ] Error monitoring set up
- [ ] Change route `/` from Waitlist to Index (landing page)
- [ ] Update `src/App.tsx` line 51: `<Route path="/" element={<Index />} />`

---

## 📊 Subscription Plans

| Plan | Monthly | Leads Limit | Features |
|------|---------|-------------|----------|
| Growth | $49 | 1,000 | Basic features |
| Pro | $199 | 10,000 | + AI Coach, Automations, Analytics |
| Elite | $499 | Unlimited | + API Access, Team, White Label |

---

## 🔗 External Dependencies

| Service | Purpose | Status |
|---------|---------|--------|
| People Data Labs | Lead search/enrichment | 🔴 Credits exhausted |
| Stripe | Payments | ✅ Connected |
| Resend | Email | ✅ Connected |
| Railway | PDL proxy with caching | ✅ Running |

---

## 📞 Support Contacts

- **Lovable Support:** In-app chat or docs.lovable.dev
- **PDL Credits:** https://www.peopledatalabs.com/pricing
- **Stripe Dashboard:** https://dashboard.stripe.com

---

## 📝 Change Log

| Date | Change | Files |
|------|--------|-------|
| 2025-12-31 | Added credit exhaustion handling | `fetch-external-leads/index.ts` |
| 2025-12-31 | Added keywords extraction | `fetch-external-leads/index.ts`, `Leads.tsx` |
| 2025-12-31 | Improved error toasts | `use-external-leads.tsx` |
| 2025-12-30 | Added cache stats fetching | `fetch-external-leads/index.ts` |

---

*This document is maintained alongside the codebase. Update when making significant changes.*
