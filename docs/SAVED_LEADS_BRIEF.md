# Saved Leads: design brief

## 1. Feature summary

Saved Leads is the CRM of the platform, not a list of search results. It is where
an outbound operator decides who to contact next, confirms enrichment and scoring
actually landed, moves people through pipeline state, and looks one person up.
Agents work in it too, so it is both a human surface and the place automated work
becomes visible.

It has never had a design pass. Two consistency sweeps gave it the app's chrome
and title; the table itself was never designed.

## 2. Primary user action

Scan a dense list and decide who is worth the next email, without leaving the
page to find out.

Everything else (editing state, verifying data, finding one person) has to stay
possible without making that first thing slower.

## 3. Design direction

**Colour: Restrained.** Tinted neutrals carry the row. Violet, the app's single
accent, marks one thing only. Meaning comes from shape, position and weight
rather than hue. This is the constraint that makes five visible signals possible:
five colours would reproduce the rainbow-of-pills the page has now.

**Theme: dark, inherited rather than chosen.** The scene: an operator who lives
in this tool all day with six tabs open, glancing between it and Gmail. The
surface has to sit beside the rest of the app without a flashbulb of white on
every switch. A single light page inside a committed dark product is incoherence,
not contrast.

**Anchors: Attio first, Linear second.** Attio because it is a CRM built as a
spreadsheet: data-dense, cells that feel editable, structure over decoration,
made for working in rather than reading. Linear for the discipline of carrying
meaning in small marks and typography instead of colour. DESIGN.md already names
Linear.

**The slop risk, named.** Dark plus violet plus restrained plus Attio is a
guessable lane for a B2B CRM, and a guessable lane is the second-order failure
the design laws warn about. The palette and the references cannot be what makes
this distinctive, because they are inherited and correct. What makes it specific
is section 5: an encoding system for five simultaneous signals that is particular
to this product and could not be guessed from the category.

## 4. Scope

Whole page, production-ready: table, filter bar, grid view, detail sheet, so the
page reads as one thing rather than four.

Includes required data-layer work (section 10). Tens of thousands of leads is a
build constraint, not a visual one.

## 5. Layout strategy

### The core problem

Five signals stay on every row: Tier, ICP fit, Intent, AI priority, and the lead
evaluation's recommended next step. Today all five are pills, so the eye has to
read each one to know what it is. Seven of twelve columns look identical and
nothing reads as more important than anything else.

**Five signals do not mean five pills.** Give each a different encoding, so the
eye parses them by form before reading any of them:

| Signal | What it is | Encoding |
|---|---|---|
| Tier | a grade, A to D | a letterform leading the row, typographic, no chip |
| ICP fit | a proportion, 0 to 100 | a short horizontal bar, so fit compares vertically down the column at a glance |
| Intent | a score plus a heat word | tabular figures, right-aligned; the word appears only above threshold, where it earns the space |
| AI priority | ordinal, low to high | a three-step mark, like signal bars; read as level without reading a word |
| Next step | a recommendation | quiet text, because it is a sentence rather than a score |

Five forms, one accent colour. Nothing competes because nothing shares a shape.

### The rest of the row

**Identity is the anchor.** Contact and company carry the most weight, left, with
the clearest type. Everything else is an attribute of them.

**Delete the Enriched column.** Every row says "Enriched", so the column carries
no information and costs its width. Information lives in the exception: mark the
rows that are *not* enriched, and say nothing on the rows that are.

**Align numbers like a terminal.** Tabular figures, right-aligned, so a column of
scores is scannable vertically. This is most of what makes Attio and Bloomberg
fast, and it is free.

**Vary the rhythm.** Identity gets room; scores are tight and aligned; state is
at the trailing edge where actions live. Even spacing across twelve columns is
what makes a table read as generated.

### Filters

Seven always-visible dropdowns compete with the data for attention while sitting
at the same visual weight. They stay visible, because hiding them behind a
Filters button is the "hiding things behind clicks" anti-goal, but they get
quieter than the rows they act on, and an applied filter reads as applied.

## 6. Key states

- **Default**: rows, scannable, nothing selected.
- **Empty, no leads**: first run. Points at where leads come from.
- **Empty, filtered out**: different message entirely, and it must offer to clear
  the filters. Today these two look the same, which turns a filter mistake into
  "the product lost my leads."
- **Loading**: skeleton rows at the real row height, so the page does not jump.
- **Error**: says what failed and offers a retry.
- **Work in progress**: the enrichment or scoring bar, now also reflected in the
  shell's background-work bar.
- **Selection active**: bulk actions appear without the row layout shifting.
- **Partial data**: a lead with no email, no score, or no evaluation. Common, and
  currently rendered as an empty cell that reads as a bug.

## 7. Interaction model

Row click opens the detail sheet, unchanged. Checkbox selects. Status edits
inline. **All three must keep working exactly as they do**: agents operate in
this page and a redesign that moves selection or inline editing breaks how the
account actually runs. This is a stated anti-goal and it constrains the layout,
not the other way round.

Sorting moves server-side and stays on the column headers. Keyboard: the row is
reachable and the sheet is dismissible, as a table this dense should be.

## 8. Content requirements

- Empty-with-filters copy, distinct from empty-no-leads.
- A label for "not enriched yet" that reads as a state, not a failure.
- Threshold wording for intent heat, consistent with the agent's own vocabulary.
- Nothing decorative. The page is a system of record and every word on it is
  either a datum or a control.

## 9. Recommended references

`reference/product.md` for the register. Spatial and interaction references for
table density, alignment and selection behaviour.

## 10. Required, and not cosmetic

The page loads leads in pages of 1,000 with `select("*")`, up to 20,000 rows, into
browser memory, then filters and sorts client-side in a `useMemo`.

At the stated scale this fails three ways:

1. **Payload and parse.** Every column of every lead, including research briefs
   and notes, for up to twenty thousand rows, on every visit.
2. **A silent ceiling.** The loop stops at twenty thousand. Lead 20,001 does not
   exist and nothing says so. This is the same shape as the twenty-draft ceiling
   and the hundred-user sweep cap: a bound that cannot be raised and is never
   reported.
3. **Unvirtualized rendering** of whatever it did load.

So: server-side filtering, sorting and pagination, virtualized rows, and a
selected column list rather than `select("*")`. The filter dropdowns' own options
are currently built from the rows in memory, which means the Industries list
changes depending on what happens to be loaded; those become their own query.

No redesign survives ten thousand rows without this, which is why it is in the
brief rather than in a follow-up.

## 11. Open questions

- Bulk selection across pages once paging is server-side: does selecting all mean
  the page or the filtered set? The answer changes the bulk bar's copy and the
  delete confirmation.
- Whether the grid view earns its place once the table is dense and fast, or
  whether it exists because the table was hard to read.
