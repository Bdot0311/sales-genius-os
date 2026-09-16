- [x] GetLeads pixel in landing page head

- [x] Wire outbound webhooks to real lead/deal events + minute cron dispatcher
- [x] Redeploy Railway-backed edge functions after Railway service update
- [x] Fix inbound webhook compatibility for providers without custom headers

- [x] Fix edge function type-check build errors (auth-email-hook, check-copy-risk, ingest-dmarc-report)
- [x] Fix mobile dashboard overflow and overlapping action controls
- [x] Restore the existing Web Push notification settings flow

- [x] System health issue emails stopped sending — fixed: the old queue-based send path no longer existed; alerts now go through the system-health-alert function
