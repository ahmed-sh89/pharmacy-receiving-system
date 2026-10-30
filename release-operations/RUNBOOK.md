# Photo cleanup operations

Production: `zznoshzcyxmtwfbznjyr`; worker: `pharmflow-expiry-photo-cleanup`.
Receiving and Expiry share the existing queue and eligibility rules. Do not manually
delete Storage files, loosen eligibility, reset leases, or acknowledge jobs by hand.

## Safe diagnosis

The GitHub workflow emits only a fixed failure stage and numeric HTTP status.
`configuration` means the exact Production URL or token is missing/wrong.
`request` means a transport/timeout/redirect failure. `http_response` with 401
means the worker rejected authentication; 503 means inspect protected worker logs.
`response_json` means a malformed success response; `acknowledgement` means the
strict batch acknowledgement failed. Never log tokens, headers, response bodies,
job paths or raw exceptions. GitHub masking alone is not credential validation.

For 401, synchronize GitHub `EXPIRY_CLEANUP_CRON_TOKEN` with the existing worker
secret using the owner's secure credential process; never paste it into issues,
chat, commits or logs. Do not rotate the working worker credential unnecessarily.
Confirm `EXPIRY_CLEANUP_WORKER_URL` exactly targets the Production worker. GitHub
Secrets values cannot be read back through the contents/PR connector.

Before any live POST or dispatch, inspect the current queue and deployed
`photo_cleanup_eligible` function, including unresolved references, grace periods,
scopes, leases and retries. A normal invocation can delete eligible files: it is
not a dry run. Obtain Product Owner authorization if verification requires deletion.
Do not alter the existing hourly Supabase scheduler as a workaround.

## Incident evidence — 30 October 2026

Baseline main `4978f12e9daf92eb60205e140583b0e3aa758f49` (PR #35 preserved).
Last successful GitHub run #5, ID 39715829269, 22 Oct 03:15 UTC:
claimed/completed=1, failures/lost/deferred=0. Next run #6, ID 39734215968,
22 Oct 06:29 UTC: worker returned 401. The invocation script is identical.
Run #49, ID 40962395108, 29 Oct 22:00 UTC also correlates with worker 401.
Thus GitHub's supplied credential is rejected; the exact secret edit/history
has not been independently inspected. Worker v7 has verify_jwt=false and checks
the bearer token against its environment secret before any claim/deletion.

An independent active pg_cron job `pharmflow-photo-cleanup` runs hourly against
the verified Production worker. Read-only pg_net evidence at 30 Oct 01:00 UTC:
HTTP 200, success=true, claimed/completed/failed/claim_lost/deferred all zero.
All eight queued jobs are DONE, latest completion 27 Oct 13:00 UTC; no DONE file
remains in Storage and no DONE path is referenced by a PENDING review.
This establishes hourly operation within the inspected evidence, not blanket
certification of every possible reference/race. No live invocation was made.

Pending: GitHub secret synchronization, successful GitHub workflow verification.
The diagnostics change alone does not repair the rejected credential. No worker,
database, retention, retry, audit or application runtime changes are required here.
