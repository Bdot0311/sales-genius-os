

# AEO Optimization Plan: Make SalesOS Crawlable by AI

## The Problem

AI crawlers (ChatGPT, Claude, Perplexity) report "JS SPA with no crawlable content" because `index.html` body is just:
```html
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

Your meta tags and JSON-LD in `<head>` are solid, but the **body has zero text content** for non-JS crawlers. The `llms.txt` endpoint exists but crawlers hitting the main URL see nothing.

## The Solution

Inject a comprehensive **static HTML content block** into `index.html` inside a `<noscript>` + hidden `<div>` that contains all your key landing page content in semantic, crawlable HTML. This is the standard approach for SPAs without SSR.

### What gets added to `index.html` body (before `<div id="root">`):

1. **Hidden semantic content block** (`display:none` div with `id="static-content"`) containing:
   - H1 headline and value proposition
   - "How It Works" steps as an ordered list
   - Key features as a definition list
   - Pricing tiers as a structured table
   - FAQ as plain HTML (mirrors the JSON-LD)
   - Integration list
   - Results/stats
   - Links to all public pages

2. **`<noscript>` fallback** with a readable version of the same content for crawlers that skip hidden elements

3. **Update `llms.txt` static file** to match the dynamic edge function content (sync pricing to $39-$179 range, update date)

### Technical Details

- The hidden div uses `display:none` which Google explicitly allows for structured content backing JSON-LD
- AI crawlers like GPTBot and ClaudeBot parse all HTML regardless of visibility
- Content mirrors what's already in JSON-LD and React components -- no duplicate content risk
- React app mounts normally over `<div id="root">` -- zero impact on user experience
- No new dependencies, no SSR, no build changes

### Files Modified

| File | Change |
|------|--------|
| `index.html` | Add static crawlable content block + noscript fallback in body |
| `public/llms.txt` | Sync with edge function content (dates, pricing) |

