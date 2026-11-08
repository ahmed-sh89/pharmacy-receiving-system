# Security candidate execution — separate Production approval required

Base main/served: 1457f45fdf2af0ec84546a076e64191b5980a79a. Stop on source/DB/Edge drift; refresh exact hashes and recovery evidence before execution. Do not replay historical migration folders.

1. Pin approved PR head; require normal protected-PR checks. Confirm backups/recovery availability, exact Production project zznoshzcyxmtwfbznjyr and existing pharmacy/module activation. Preserve all receiving/expiry/duty data and permissions.
2. In one database transaction apply ONLY, in this order:
   - supabase/migrations/20261108123709_security_session_boundaries.sql
   - supabase/migrations/20261108124636_security_live_session_request_gate.sql
   Record exact SQL/history atomically; source SHA-256 values are in release-hashes.json. Verify known-definition guards before committing. Required core role helpers must be present; optional legacy functions stay absent if absent. No table data, existing grants or policies are changed.
3. Read back new self-session RPC grants (anon/PUBLIC denied, authenticated allowed), original function owners/ACLs and all expected body changes. Verify optional legacy contracts and three Production trigger search paths explicitly. Staging lacked get_global_master_gtin_page, bootstrap_system_owner and the three trigger functions; their exact-source tests were isolated, not hosted parity claims.
4. Only AFTER both migrations succeed, deploy the two approved repository Edge sources: pharmflow-password-admin and pharmflow-password-admin-settings-rc, verify_jwt=true. Preserve the Production URL guard and all current v7/v5 behavior. Pin/read back source hashes. Staging was v6/v3 with the same candidate logic and only the existing Stage environment binding.
5. Merge only through the existing reviewed/check-protected PR route and verify official GitHub Pages SHA/artifact. This release changes no browser runtime bytes; merging alone does not apply SQL or publish Edge functions. Keep Vercel main automatic Production disabled.
6. Non-destructive smoke: login/refresh/logout, Receiving orders/report, Expiry inventory, Duty schedule/report, Administrator permissions. If approved, disposable Production identity only for password/revocation acceptance; do not reset operational accounts. Preserve pending scan queues; do not clear browser storage.

Staging migration-history versions were assigned by the hosting tool: 20261108124132/security_session_boundaries and 20261108124709/security_live_session_request_gate. Exact stored-source MD5 values ce6a8bda1199a97c2fbd1755018b2d7a and dccb8592f10ebcdfa97d6154b4b32899 match the committed source bytes. Production migration file ordering above is authoritative for this release; do not replay the Stage versions onto Stage.

Forward recovery is preferred: keep valid-session enforcement and fix only the failing boundary. A database transaction failure must roll back both migrations/history; uncertain COMMIT requires read-only reconciliation, not replay.

If Edge publication fails, old deployed handlers remain compatible with the additive RPC/database changes; retry the approved exact source after diagnosis. Do not remove the new RPC while a new handler depends on it. Emergency Edge rollback must use the captured exact Production-before sources here (v7/v5), not stale repository sources that omit weak_password handling. Such rollback restores a missing explicit session check and needs a separate security decision.

rollback-reference.sql.txt is a non-executable historical reference, not a blind rollback migration. Reverting helper changes reopens the identified boundaries; require separate explicit authorization and exact candidate-hash matching. Revert the request-guard exception only after no handler uses the probe, then consider dropping the additive RPC. Never restore databases, withdrawn grants, operational records or older SEC-007 controls as an application rollback.
