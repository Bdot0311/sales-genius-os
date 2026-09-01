# DMARC report intake

Inbound mail to `dmarc.outreign.io` becomes rows in `dmarc_reports` and
`dmarc_report_records`.

```
receiver (Google/Microsoft/Yahoo)
  → rua=mailto:<token>@dmarc.outreign.io
  → Cloudflare Email Routing (MX on dmarc.outreign.io)
  → this Worker
  → POST /functions/v1/ingest-dmarc-report
  → parsed, stored against the domain that owns <token>
```

## One-time setup

**1. Cloudflare Email Routing** on the `outreign.io` zone, with `dmarc` added
under Settings → Subdomains. Cloudflare adds the MX records itself.

**2. The external-destination record.** DMARC (RFC 7489 §7.1) will not let a
domain send reports to an address outside itself unless the receiving domain
consents. Without this, receivers silently send nothing:

```
Name:  *._report._dmarc.outreign.io
Type:  TXT
Value: v=DMARC1
```

The wildcard authorises any customer domain. Verify against a real report
before telling customers the feature works — a missing or mis-scoped record
here produces an empty dashboard with no error anywhere.

**3. Secrets.** Generate one value and set it in both places:

```
openssl rand -hex 32
```

- Supabase function secret: `DMARC_INGEST_SECRET`
- Worker variable: `INGEST_SECRET` (plus `INGEST_URL`)

**4. Catch-all rule** → Send to a Worker → this Worker.

## Checking it works

```
curl -i -X POST "$INGEST_URL" \
  -H "x-dmarc-ingest-secret: $INGEST_SECRET" \
  -H "x-dmarc-recipient: <a real token>@dmarc.outreign.io" \
  -H "Content-Type: message/rfc822" \
  --data-binary @report.eml
```

`{"accepted":true,...}` means it stored. A `202` with `accepted:false` means the
mail arrived but carried nothing usable — the reason is in the body and in the
function logs. `401` means the secret does not match.

## What to expect

Receivers send aggregate reports **once a day**. Nothing appears in the first
few hours no matter how correct the setup is, and a trend takes a week or two.
Judge the setup by the function logs, not by the dashboard.
