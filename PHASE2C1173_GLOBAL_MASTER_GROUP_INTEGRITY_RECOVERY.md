# PHASE2C1173 recovery and execution order

## Forward migration boundary

`PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY.sql` is a single transaction. An error before `COMMIT` rolls back both the schema/RPC edits and the Group data updates. Do not split the file into separate executions.

The fresh read-only Production RPC inventory found these creation routes: `create_pharmflow_global_item_v2` is the only function that inserts a Global Item; `create_pharmflow_global_item_and_learn_v1` delegates to it; legacy `learn_pharmflow_identifier_v1` can reach that wrapper; the sealed `pharmflow_approved_import_20261015` RPC also calls the core function with its approved `group` field. The forward migration validates Group in the core function, so all four are enforced. `learn_pharmflow_identifier_v2` routes an existing item to the existing-item identifier function without Group and passes Group only when the Global Item is missing. Direct authenticated table writes were denied by the existing Production grants. These are code/catalog-path checks, not isolated runtime tests.

## Data recovery (separate from RPC recovery)

`PHASE2C1173_GLOBAL_MASTER_GROUP_INTEGRITY_ROLLBACK.sql` is a **data-only** recovery. It restores `group_name` from the audit before-image only when the current Group still equals the migration's recorded `new_group_name`. If a Group was subsequently changed to a third value, it stops for manual review. It retains the audit table and all new-item Group enforcement. It does not change `category`, `sub_category`, items, identifiers, quantities, or transaction records.

## RPC and client recovery

There is intentionally no automatic RPC downgrade. Dropping the new validator or restoring the prior `create_pharmflow_global_item_v2` body would reopen the null-Group creation defect. If the app must be rolled back after the forward migration, retain the database enforcement: the compatibility `learn_pharmflow_identifier_v1` still supports existing-item links and fails closed when an old client tries to create a missing Global Item without Group. Do not run the data recovery merely because an app release is rolled back.

Any exceptional request to restore old RPC definitions must be a separately reviewed and explicitly approved SQL change based on captured pre-migration definitions. That action would intentionally remove the protection and is not part of this package's safe recovery path.

## Production order after approvals

1. Confirm a recoverable database snapshot/backup and capture a fresh before-count and the migration file SHA-256.
2. Obtain explicit approval for the exact forward SQL file and execute it once as one transaction.
3. Verify the emitted before/after counts, the 61 approved rows, unchanged item count and classification fields, and the two preserved PFTEST exceptions.
4. Deploy the reviewed app source to Production `main` only after a separate release approval. Keep the gap short: older clients can link existing items through the compatibility RPC, while missing-item creation fails closed until the new client is deployed.
5. Run the focused Production acceptance checks. If the app is rolled back, keep the RPC enforcement. Use the data-only recovery file only with separate explicit recovery approval and after reviewing post-migration edits.

## Test-environment limitation

The supplied Staging project `tovkcakucyagvbzvlnks` returned a permission-denied error to both `get_project` and read-only `execute_sql`. No local `psql`, PostgreSQL, Docker, or Supabase CLI executable was available. The active Expiry Staging database was not modified. Therefore this package has not been applied to or behavior-tested against an isolated PostgreSQL/Supabase database; SQL execution/syntax, role/RLS behavior, authenticated valid/invalid Group creation, prompt-free existing-item linking, concurrency/idempotency/conflict behavior, and real RPC transaction atomicity remain unverified before Production.
