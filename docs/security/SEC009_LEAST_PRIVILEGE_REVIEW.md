# SEC-009 least-privilege proposal — not applied

Fresh Production catalog identifies TRUNCATE/REFERENCES/TRIGGER on11 public tables for anon/authenticated. The sibling SQL proposal revokes only those exact non-CRUD privileges; no table/data/RLS/policy/function permission changes. Fresh grants are captured in the security execution report. In-memory PGlite tests apply the actual proposal to11 synthetic tables and verify SELECT/INSERT/UPDATE/DELETE and RLS/data quantity62 remain intact while all66 excess role/table/privilege combinations are removed. No Supabase migration was applied.

Approval gate: re-read exact ACLs and table dependencies, review this SQL and supported anonymous bootstrap/RPC role matrix, then separately authorize Production permission changes. Stage lacked these observed extra grants; an unnecessary no-op Stage migration was avoided.

Rollback restores exactly the observed grants for both roles only if a separately approved regression response requires it; doing so reopens the finding. Never loosen RLS or remove audit/history records.
