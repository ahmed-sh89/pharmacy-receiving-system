# Account compatibility — proposed Staging gate

Target: `tovkcakucyagvbzvlnks` only. **NOT APPLIED. Product Owner approval required.**
Approved visual baseline: `fce27cd154ad011982a0caee1a52779d4c966cf1`.

## Actual dependencies

- Identity display: `get_my_app_context()`; definition, output columns and authenticated-only execution grants match Production. It uses existing `profiles`, `pharmacy_members`, `pharmacies`, `system_owners` and `auth.users`.
- Change Password: existing GoTrue `/auth/v1/token?grant_type=password` then `/auth/v1/user`; no new database RPC is needed. Existing validation and reauthentication are unchanged.
- Edit: `saveSettingsIdentity` in `js/auth.js` calls `owner_update_pharmacy_identity_v1(uuid,text,text)`, reloads `get_my_app_context()`, then calls `owner_list_pharmacies()` before closing. Both missing RPCs are required for this flow.
- `update_my_pharmacy_name` is called only by a legacy profile editor whose panel, inputs and Save button are absent from the loaded root HTML. It is deliberately excluded.
- Sign Out: existing GoTrue logout/session cleanup; no new RPC.
- Existing `is_system_owner`, `is_pharmacy_admin`, `is_pharmacy_member` definitions and authenticated-only grants match Production. They are not replaced.

## Reviewed differences and proposed minimum

`20261023_account_compatibility.sql` creates two missing RPCs and the identity audit table. It adds `pharmacies.created_at`, `updated_at`, `approved_at`, the Production identity NOT NULL safeguards and a unique code constraint. Four current Staging pharmacy identities were checked only for null/duplicate counts: neither problem exists.

Existing historical timestamps remain NULL because Staging never stored them. Defaults affect future inserts only. No operational row is copied, renamed, deleted or backfilled. Existing pharmacy, membership, profile and owner RLS/grants remain unchanged. The audit table enables RLS and denies direct public/anon/authenticated access, matching the Production audit boundary. Audit inserts occur solely through the guarded owner definer function.

The edit RPC body reproduces the current Production definition, including `auth.uid()` owner checking, normalized codes, code-collision rejection, locked row update, HHP084 protection and audit insertion. The list RPC reproduces its Production output and query; its equivalent owner predicate uses existing `is_system_owner()` rather than adding missing `medryvo_is_system_owner()`. Both use fixed search paths, authenticated EXECUTE grants, and no PUBLIC/anon EXECUTE. Definer rights are required because direct table access is denied; no broad table grants or tenant bypass are added.

The proposal is transactional, has a 5-second lock timeout, and aborts if the reviewed missing-object baseline changed. It is stored outside `supabase/migrations` and no automatic SQL application is configured.

## Bounded exclusions

Owner administrative registration listing is also absent on Staging (`owner_list_pharmacy_registrations`), but is not needed by Account edit/save; unrelated owner-management functionality is outside this migration. No Receiving/Expiry compatibility objects, status triggers, user migrations, passwords, sessions or tokens are copied. The account update does not alter pharmacy status, so unrelated status-sync triggers are excluded.

## Preview isolation

Only this branch uses generated Staging public runtime configuration. Its Vercel variables are scoped to Preview + this exact branch. Builds reject missing/wrong URLs, wrong-project/privileged keys and Vercel Production/wrong-branch targets. The raw source has no Production endpoint fallback and fails closed without generated config. Root CSP restricts connections to self plus the Staging HTTPS/WSS endpoint. The approved static visual demo keeps `connect-src 'none'` and is unchanged.

## Verification and rollback

Focused tests exercise the draft in an isolated local in-memory Postgres (PGlite), using fictional identities only. They verify row preservation, authorization rejection, HHP084, collision/empty-name checks, owner persistence, auditing and repeat-application refusal. These are **automated local tests**, not live authenticated Staging acceptance.

No migration or authenticated write may occur until approval. Live password, edit persistence, audit and account-isolation tests remain BLOCKED. Vercel login-page readiness and public/read-only network checks do not establish authenticated readiness.

Rollback after a separately approved application: disable/revoke the two added RPCs before further account edits, redeploy a compatible Staging-only client, and retain the audit records and additive timestamp columns. Do not drop populated audit history or restore a Production fallback. A full schema rollback would need a separate reviewed plan based on subsequent use. Preview source rollback is separate from database rollback.
