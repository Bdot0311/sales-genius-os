# Data-use wording for the scoring model

**Draft, for a lawyer to check before it goes live.** I am not one, and this is
not legal advice. What is below is written to be accurate about what the code
actually does, which is the part I can be sure of and the part a lawyer cannot
work out for themselves. The bit that needs professional review is whether it
satisfies UK/EU GDPR and the US state privacy laws for the places your
customers are, because training a model on data about identifiable people is a
genuinely regulated use and the wording has to name a lawful basis.

Read the three clauses as a set. The accuracy of each is the whole point: if
the product does something the wording does not describe, the wording is worse
than having none, because it becomes a false statement you have published.

---

## 1. Terms of service — a new clause

> **Improving our lead scoring.** With your permission, we use information about
> how your outbound email performed to improve the scoring that OutReign shows
> you and other customers. This means: for each email you send through
> OutReign, we record the characteristics of the recipient's role and company
> as they were at the time of sending, the characteristics of the email itself,
> and what happened next — whether it was delivered, whether somebody replied,
> and what kind of reply it was.
>
> We do not use the words of your emails or of the replies you receive for this
> purpose, and we do not use the names, email addresses, or any other contact
> details of the people you contact.
>
> You choose whether to take part. You can change that choice at any time in
> Settings, and we will stop using your data for this purpose from that point.
> Turning it off does not affect anything else about your account, and we do
> not charge differently either way.

## 2. Privacy policy — a new section

> ### Improving our lead scoring
>
> **What we use.** Where you have agreed to it, we use a record of each
> outbound email sent through OutReign to improve the lead scoring we offer.
> That record contains:
>
> - characteristics of the recipient, as they stood when the email was sent:
>   seniority band, department, company size band, industry, country, and the
>   buying signals we had identified
> - our own scores and recommendations for that lead at that moment
> - characteristics of the email: its length, whether it asked a question,
>   whether it contained a link, what it was personalised on, the hour and day
>   it was sent, and whether a person wrote or edited it
> - what happened: delivered, bounced, unsubscribed, or replied — and for a
>   reply, a category such as interested, objection, wrong person or
>   out-of-office
>
> **What we do not use.** The text of your emails and of the replies you
> receive. The names, email addresses, telephone numbers or social profiles of
> the people you contact. Anything that identifies an individual recipient.
>
> **How it is separated.** The records we use for this purpose are stored
> without the identifiers that would link them back to a named person or to a
> particular customer account, and the files we work from contain only the
> characteristics and outcomes listed above.
>
> **Why we are allowed to.** We rely on your consent, which you give by turning
> this on and can withdraw at any time in Settings. Withdrawing stops any
> further use of your data for this purpose.
>
> **How long.** We keep these records for as long as we are developing and
> operating the scoring, and we delete them when we stop.
>
> **Your recipients.** If you are in the UK or EU, you are the data controller
> for the people you contact and we act on your instructions. This section
> describes a use you may permit; it does not transfer your own obligations to
> those people.

## 3. The in-app consent prompt

Shown once to existing customers and during setup for new ones. Three
sentences, a real choice, and no default.

> **Help improve OutReign's lead scoring?**
>
> We can learn which kinds of leads reply from what happens to the emails you
> send — the recipient's seniority, company size, industry and buying signals,
> what the email looked like, and whether you got a reply. It never includes
> the words of your emails, the replies you receive, or anyone's name or email
> address.
>
> It makes the scoring better for you and for everyone else using OutReign.
> You can change your mind any time in Settings.
>
> [ Yes, use my outcome data ]   [ No thanks ]

And in Settings, as a row that reflects the stored state honestly:

> **Help improve lead scoring** — Share how your emails performed, with no
> message content and no contact details. [toggle]
> _Not set / On since 3 March 2026 / Off since 12 April 2026_

---

## What the wording commits you to, and what enforces it

Each promise above is a thing the code has to keep doing. These are the
mechanisms, so a future change that breaks a promise is visible rather than
silent:

| The promise | What keeps it |
|---|---|
| No message text | `lead_feature_snapshots` has no body or subject column; the export allowlist in `admin-dataset-readiness` lists 40 columns by name and a test asserts none of `subject`, `body_html`, `body_text` or `reply_content` is among them |
| No names or addresses | The same allowlist; and `user_id`, `lead_id`, `send_id` and `snapshot_id` are excluded too, so an export cannot be joined back to a person |
| Bands, not exact values | `outcome_seniority_band` and `outcome_company_size_band` write a band at capture time; the exact title and headcount are never copied into the snapshot |
| Reply categories, not reply text | `reply_analysis.outcome_label` is one of eleven values, constrained in the database |
| Opt-out stops further use | Phase 5, not yet built. Until it is, the wording above must not be published, because the sentence about changing your mind would not yet be true |
| Withdrawal is free | No pricing or plan logic reads the consent flag |

## Two things to decide before this ships

**Consent is tri-state, not a default.** You asked for every existing customer
to be asked as well as every new one, so the stored value is "not yet asked",
"yes" or "no" — never an assumed yes. Exports count only an explicit yes. That
is more conservative than the original plan and it is the reason the prompt
above has no pre-selected button.

**Whether a customer's own stats should still work when they opt out.** Right
now their own numbers would keep working and only the cross-customer export
would exclude them. That seems right — they are not being asked to give up
their own reporting — but it is a product decision, and the wording above
implies it by saying "stop using your data for this purpose" rather than "stop
collecting".
