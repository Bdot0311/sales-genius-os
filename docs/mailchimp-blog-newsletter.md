# OutReign full-article newsletter

## Edited BDØT template — November 21, 2026, 07:49 UTC

- Used the newly uploaded `BDØT_template-2.html`; Mailchimp confirms BDØT template 10125960 was edited at 07:44:49 UTC. Preserved the updated centered crown logo, black/purple title band, image frame, typography, social links and footer. Replaced placeholder feed text with the complete previously reviewed article and existing GPT graphics. The footer browser button opens the email archive, not the landing-site blog; postal-address merge tag retained.
- Created **OutReign blog — edited BDØT November 21 owner review** (`66a4b6154a`) as standalone exported HTML (`template_id: 0`) because the prior saved-template connection emptied content. No audience attached. Existing campaigns were absent from the account's campaign list; none were deleted by this request.
- Separate Mailchimp content read/checklist confirms custom HTML and generated plain text. Actual returned HTML checked at 1280px and 390px: all eight article/reply headings present, all five images (logo, two graphics, two social icons) loaded, no horizontal overflow. Full article text exceeds 7,000 characters. Export scripts and placeholder claims/images removed.
- Mailchimp accepted an owner-only HTML test to **info@bdotindustries.org** (HTTP 204). Separate post-test read retains the full article and design. Inbox receipt/IONOS rendering still requires owner confirmation. No subscriber import, send, scheduling or published-blog change.
- Updated HTML: `docs/mailchimp-blog-newsletter.html`; hosted preview pointer: `docs/mailchimp-blog-newsletter.asset.json`.

## Blank BDØT test repair — November 21, 2026

- Owner confirmed the previous test was blank. Post-test GET of `0d178ef7dd/content` contains only API links; checklist reports missing email content. The prior pre-test HTML read did not establish successful delivery. That draft still has the multichannel saved-template binding; the exact provider-side erasure mechanism is not exposed.
- Created **OutReign BDØT full article — standalone HTML owner test** (`0b110ef8e4`) with `template_id: 0`, preserving the exported BDØT design in the HTML itself. No audience attached. Uploaded the same complete illustrated article; repeated checklist checks now report successful custom HTML and generated plain text, unlike the old draft.
- Returned HTML matches committed HTML exactly. Desktop/phone rendering verifies seven article sections plus the reply prompt, three loaded images and no overflow.
- Replacement owner-only test to **info@bdotindustries.org** accepted (HTTP 204). Separate post-test GET still contains the complete article in HTML/plain text; post-test checklist still reports custom HTML success. Inbox receipt/rendering awaits owner confirmation. No subscriber send or import.

## BDØT saved-template request — November 21, 2026

- Owner selected saved **BDØT template** (10125960). The previous campaign no longer exists and the campaign list was empty.
- Created review-only **OutReign blog — BDØT template owner test** (0d178ef7dd), with the selected user template and info@bdotindustries.org sender. No audience attached.
- Applying the template through campaign content returned success but no HTML or plain text. A separate content read remained empty; Mailchimp's send checklist explicitly reports “This campaign doesn't have any content yet.” Default-content has no editable sections, and template metadata reports `content_type: multichannel`.
- Owner supplied `BDØT_template.html`. Adapted its actual logo, black background, purple editorial title band, typography and preferences/unsubscribe footer to a full-article layout; removed sample feed teasers, placeholder images, sample claims and the exported script. Preserved both existing GPT illustrations and four highlighted paragraphs. The saved BDØT template itself was not overwritten.
- Saved full HTML directly to the owner-test campaign without reapplying the template afterward. A separate GET confirms the complete article in outgoing HTML and plain text. Rendered the returned HTML at 1280px and 390px: seven article sections plus the reply prompt, logo and both graphics loaded, no horizontal overflow.
- Owner-only test to **info@bdotindustries.org** accepted by Mailchimp (HTTP 204), November 21, 2026. Inbox receipt and IONOS rendering remain unverified. No audience attached, subscriber import, subscriber send or automatic scheduling.

- Draft: **OutReign Field Notes — Mailchimp sales layout + GPT graphics owner test** in brandon's Mailchimp.
- Article: **How to Set Up Automated Outreach That Feels Human**, November 20, 2026, seven sections included directly in the email.
- Design: adapted Mailchimp's actual **Sell Products** base email template (146), retaining its header/body/footer table structure and using OutReign purple branding, crown logo, four lavender/mint paragraph bubbles and the complete article. The API catalog has no template named Sell Services; Lead Generation templates are landing pages, not email templates. Two matching papercraft illustrations generated with **OpenAI GPT Image 2** and stored through project asset pointers. Numbered sections, serif headings, author/date preserved; no read-the-guide button. Mailchimp CSS inlining enabled.
- Committed HTML: `docs/mailchimp-blog-newsletter.html`. Mailchimp generates a complete plain-text alternative from it.
- Editorial safeguards: unsupported reply-rate ranges and promised review times removed from the email; research inference changed to a question; human approval preserved. Published blog copy was not changed.
- Blank-test correction: the owner's inbox screenshot showed empty header/body bands. A fresh GET of campaign content confirmed Mailchimp's outgoing `html`, `archive_html`, and `plain_text` contained only the empty Sell Products template/footer, not the article. Restored the complete custom HTML with PUT `/campaigns/f745991ec3/content` without reapplying `settings.template_id` afterward.
- Verified after restoration: a separate GET of outgoing content contains the full article in HTML and plain text. Rendered that returned outgoing HTML at desktop 1280px and phone 390px: all seven sections, crown logo and both GPT illustrations load, no horizontal overflow. Browser rendering does not establish IONOS inbox rendering.
- Replacement test submitted only to **info@bdotindustries.org** on November 21, 2026; Mailchimp accepted with HTTP 204. Receipt and rendering of the replacement in IONOS await owner confirmation.
- No audience send, subscriber import, billing change or automatic newsletter scheduling.