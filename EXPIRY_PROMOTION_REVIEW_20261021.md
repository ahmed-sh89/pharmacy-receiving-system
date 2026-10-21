# Expiry integration candidate — local review only

Production base: `9477ee398dcc7ea220802ed373c5befc36855967`.
Accepted Expiry parent: `6e2a833e76e50cb46589a4eca0d03d783f95b270`.
Local branch: `review/expiry-production-20261021`. No new commit or deployment.

This uncommitted integration preserves all three newer Production hotfixes, Production Supabase configuration and Receiving core/service files. The accepted Expiry branch/Preview is unchanged. Deferred Receiving Quick Add code, RPCs and migrations are excluded.

Historical SQL under supabase/migrations and proposals is reference source, not the Production application list. Do not run db push. The separate review package contains a selective atomic backend draft, compatible shared RPC adaptations, a later legacy-capture cutover step, preservation queries and guarded recovery notes.

39 Receiving/Settings checks pass. The 200-test Expiry/shared selection has 192 passes and 8 failures also present in the accepted baseline; the baseline has 191 passes/9 failures. No new failure names. Production build, local asset/config verification and eight offline SQL/source checks pass. No database execution, role integration, concurrent transaction, restore, physical Handheld or multi-PC verification was performed for this candidate.

Status: READY FOR ISOLATED TEST REVIEW; BLOCKED FOR PRODUCTION PROMOTION. Next approval is isolated synthetic database testing only. Production SQL, publishing and deployment remain unauthorized.
