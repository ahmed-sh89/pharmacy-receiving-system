# PharmFlow B10 Clean22

## Scope
Project B only. Cloud workspace write ownership cleanup.

## Root cause addressed
A generic `files:updated` subscriber still had authority to call `forceCloudWorkspaceSnapshot()`. Any legacy/source-less periodic files event could therefore become a full Supabase workspace write even though Clean21 removed the local autosave bridge.

## Change
- Removed full workspace write authority from generic `files:updated`.
- Kept dirty structural Active Order Manifest persistence.
- Explicit structural lifecycle sync remains the only owner of full compatibility workspace writes.
- Receiving ledger writes remain unchanged.

## Non-regression
No SQL, Auth, Handheld UI, receiving quantity math, transaction queue, or Project A changes.
