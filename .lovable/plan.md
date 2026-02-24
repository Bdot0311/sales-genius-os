

# Consolidate Sequences & Message Blocks into Outreach Studio

## Overview

Move Sequences and Message Blocks from standalone pages into the Outreach Studio as two new tabs. This creates a single unified workspace for all outreach activities: composing emails, managing sequences, building message blocks, viewing sent emails, drafts, and performance.

## Changes

### 1. Update `src/pages/Outreach.tsx` -- Add two new tabs

Add "Sequences" and "Message Blocks" as tabs alongside the existing Compose, Sent, Drafts, and Performance tabs:

**New tab structure:**
| Tab | Content |
|---|---|
| Compose | Existing email composer (unchanged) |
| Sequences | Embed `SequencesList` component |
| Message Blocks | Embed `MessageBlocksList` component |
| Sent | Existing sent emails table (unchanged) |
| Drafts | Existing drafts table (unchanged) |
| Performance | Existing performance stats (unchanged) |

- Import `SequencesList` and `MessageBlocksList` from `@/components/sequences`
- Import `ListOrdered` icon (already available from lucide-react)
- Add two new `TabsTrigger` entries and their corresponding `TabsContent` sections

### 2. Update `src/components/dashboard/DashboardLayout.tsx` -- Remove sidebar entries

Remove the "Sequences" and "Message Blocks" items from the `navigation` array (lines 48-49). This declutters the sidebar since these features are now accessible within Outreach Studio.

### 3. Remove standalone pages (optional cleanup)

The following pages and routes become unnecessary:
- Remove routes `/dashboard/sequences`, `/dashboard/message-blocks` from `src/App.tsx`
- Keep `/dashboard/sequences/:id` route since the Sequence Builder/detail view still needs its own page
- The page files `src/pages/Sequences.tsx` and `src/pages/MessageBlocks.tsx` can remain but are no longer routed to from the sidebar

### 4. Keep Sequence Detail route

The `/dashboard/sequences/:id` route for `SequenceDetail` (the builder view) stays as a standalone page since it's a full-screen editor experience that users navigate to from the sequences list.

## Technical Details

### Files Modified

| File | Change |
|---|---|
| `src/pages/Outreach.tsx` | Add imports for `SequencesList`, `MessageBlocksList`, `ListOrdered`; add 2 new TabsTrigger + TabsContent sections |
| `src/components/dashboard/DashboardLayout.tsx` | Remove "Sequences" and "Message Blocks" from the `navigation` array |
| `src/App.tsx` | Remove `/dashboard/sequences` and `/dashboard/message-blocks` routes (keep `/dashboard/sequences/:id`) |

### No database or backend changes needed

This is purely a UI reorganization -- the same components render the same data, just within a different tab container.
