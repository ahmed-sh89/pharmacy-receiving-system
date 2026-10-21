# Expiry backend blocker resolution — review package

Status: corrected proposal; shared-backend application NOT APPROVED / NOT APPLIED.
The user-authorized isolated `pharmflow-staging` project has now executed this
proposal with synthetic fixtures. Production remains read-only and unapplied.
See `STAGING-SAFETY-GATE.md` for executed evidence and the release decision.
Starting development commit: a26869b8fd4450d22c5d6774eba9d5d5ee46a51b.
Branch only: feature/expiry-stage1-visual-gate.

## Canonical sources

- `tests/expiry-backend/integrity-contract.sql`: new contracts, private tables,
  photo/review integrity guards and scoped staging-delete policy.
- `tests/expiry-backend/deployed-save-contracts.json`: read-only snapshots of the
  six deployed legacy signatures, including both Needs Review overloads.
- `tests/expiry-backend/build-proposal.py`: builds the single review migration
  `20261008004855_expiry_capture_integrity_final.sql` deterministically.
- Tests include synthetic dependencies and actual SQL execution; the separate
  staging runner performs authorized synthetic writes only on its pinned project.

The earlier standalone SQL proposal is superseded. Do not apply both proposals.
The corrected migration contains additive private tables/contracts plus explicit
compatibility guards on existing Expiry capture entry points. It is not a purely
behavior-neutral schema addition. No historical rows are backfilled, guessed,
remapped or deleted. No Global Master, authentication or Receiving ledger changes.

## Corrections

1. New evidence uses the reserved private namespace
   `pharmacy/expiry-v1/operation/{product|expiry}/file-uuid.jpg|png|webp`.
   Reserve the operation first; upload with the authenticated user's token and
   `upsert=false`. Each retake uses a new filename. The Storage trigger blocks
   replacement/rename, unauthorized staging deletes and captured-evidence deletes.
   An additional narrow RLS policy permits the uploader to delete only their own
   uncommitted Expiry staging objects. Existing Receiving paths/policies unchanged.
   Once an Expiry review is successfully RESOLVED, its pharmacy admin can authorize
   ten-minute cleanup of that operation's photos, including unused retakes. The
   application must DELETE through the Storage API; never delete storage.objects
   directly to remove binary files. SQL registry rows/review/audit are retained.
2. Complete typed capture fields are required: kind, exact raw_scan,
   identifier_display, scan_format, integer quantity/month/year, worker_id,
   device_id, source, batch_no and sample_serial. Batch/serial may be null.
   Known captures also require item_code and item_name; Desktop known captures
   may use a null worker, preserving the approved Desktop attribution semantics.
   Unknown captures require an active pharmacy worker and two uploaded role-correct
   references. Both known and unknown payloads retain exact raw scan and all fields.
   Plain identifiers remain exact after scanner framing normalization. GS1 supports
   AI 01,17,10,21, parenthesized data and FNC1-separated raw forms, including AIM
   framing. Extracted GTIN/batch/serial/date must agree with supplied fields.
   GS1 day00 uses month/year; impossible concrete dates and unsupported AIs fail
   explicitly. Batch is optional when not extracted; manual batch is retained.
3. Membership-checked read RPC returns complete capture payload, review status,
   worker, attribution, resolution fields, both paths and their deletion flags.
   It returns null for absent reviews in an authorized pharmacy; unauthorized
   pharmacies raise an access error. No direct private-table grants to clients.
4. Pharmacy/operation UUID is the capture identity. Reserve/finalize/reconcile
   are owner scoped. A retry with the same payload returns the same result; a
   changed payload or another uploader fails. Quantity/event/review/media metadata
   acknowledgement commit together. Native per-item locking covers concurrent new
   known captures. The four legacy Expiry entry points and both legacy review
   overloads reject new Expiry captures; recount/clear and Receiving bodies retain
   their existing logic. The V2 review trigger prevents alternate creators/direct
   inserts from bypassing the complete-capture contract. Captured review evidence
   cannot subsequently be changed by generic quantity/photo APIs.
5. New tables have RLS and no client table/schema grants. Public functions check
   existing membership/admin helpers and explicitly revoke PUBLIC/anon execution.
   New policy/trigger scope is limited to the reserved evidence namespace/new
   Expiry reviews. Existing HHP084/System Owner and Global Master permission
   definitions are not changed. Synthetic role tests are not tests of real accounts.

## Tests and limitations

Provisioning native PostgreSQL inside Work was attempted. apt failed because the
container forbids the required setgroups/seteuid operations. No PC installation or
new Supabase project was requested. No shared-backend SQL writes were performed.

Actual local SQL execution used PostgreSQL 18.3, PGlite 0.5.8 (WASM), with fresh
synthetic auth/pharmacy/storage dependencies. The exact corrected migration and
legacy function snapshots were executed. Results: 16 SQL scenarios plus 3 static
checks PASS; native independent-connection concurrency test SKIPPED / NOT RUN.
Existing focused client/Receiving/accepted Desktop regressions: 54 PASS.
Build, syntax and diff checks PASS.

**Native PostgreSQL database integration/concurrency: NOT RUN.** PGlite uses a
single connection and cannot establish independent-session locking behavior.
Synthetic Storage metadata tests are not actual Supabase Storage HTTP/binary tests.
Fixture helpers/roles and simplified tables are not a clone of all live policies,
triggers, extensions or constraints. No live user/pharmacy data is included.

A pre-existing legacy 13-argument Receiving review function has an unqualified
created_at/output-variable ambiguity in the checked deployed body. The SQL test
verified identical failure before/after the Expiry guard. It is documented, not
silently repaired. Current client Receiving regression tests remain passing.

Run local embedded SQL tests:

`node --test tests/expiry-backend-postgres.test.cjs tests/expiry-backend-static.test.cjs`

The same SQL suite supports native PostgreSQL after a disposable local instance
is available. Set PHARMFLOW_LOCAL_PG_URL to an EMPTY database on localhost/127.0.0.1
with a name matching `pharmflow_expiry_synthetic_<suffix>`, using a local postgres
superuser. Then run the same command. The runner rejects remote hosts, other
names and nonempty databases; it never drops/resets a database. Use a disposable
local cluster because fixture roles are cluster-wide. Do not point it to Supabase.

## Exact remaining gates / next action

- Execute native PostgreSQL migration/security/integrity and separate-connection
  concurrency tests. The prepared runner includes concurrent same-operation and
  same-item captures. Storage deletion/finalization races also need native/API
  verification; the operation lock is implemented but independent-session/API
  behavior has not been executed here.
- Connect the existing Expiry client to reserve/upload/finalize/reconcile/read/
  cleanup. Current a26869b8 still writes known captures through guarded legacy V2
  and blocks unknown saves. Applying this SQL alone would block that old client.
  Do not deploy it as a standalone backend change ahead of coordinated adoption.
- Reconcile ALL pre-cutover legacy uncertain saves first. Those old calls have no
  operation UUID; no migration can reliably infer whether a new operation repeats
  a previously committed legacy capture. Rejecting old calls prevents new mixed-
  path writes, but does not magically identify historical uncertain outcomes.
- Verify actual Storage API upload, retake, finalized read and authorized deletion
  with the new namespace/trigger. Binary cleanup is not proven by SQL row deletion.
- Review the namespace/private-bucket preflight and exact guarded legacy contracts
  against the then-current shared backend before controlled approval. Existing
  namespace objects cause the migration to fail safely; they are never repurposed.

No separate Supabase project is required. Further local verification/client work
comes before asking to apply anything on the existing shared backend. No production
promotion, deployment, SQL application or schema change is authorized by this file.
