# Verified Staging Preview — 28 October 2026

**READY FOR USER TEST — PRODUCTION UNCHANGED**, limited to implemented scope. DATA-001 and EXPIRY-SAVE-001 remain OPEN.

- Verified immutable Preview: https://pharmflow-test-8liy5nq6w-fhyh2xtskz-3504.vercel.app/
- Runtime commit: `87be759e28c7bcc912c6cf8097d40955b10bcf6b`.
- Branch: `feature/consolidated-staging-20261028`.
- Deployment: `dpl_41jE7bJgdu27poEQCJMcjH8P4Scu`; project `pharmflow-test` / `prj_SLUdsr7jh2gWtOQYj44jaKxAl1Lw`; Git source; READY; target null (Preview), no Production alias/promotion.
- Live version.json returned HTTP 200, exact runtime SHA, environment staging and Supabase `tovkcakucyagvbzvlnks`.
- Live HTML returned HTTP 200, Staging-only Supabase CSP, export script and Staging label. Served Supabase config uses the Staging public key/reference. Export Worker returned HTTP 200 and exact approved source.
- Cloud browser reached `STAGING | PharmFlow | Pharmacy Operations` and the Sign in form, with the Staging test-data badge. No authenticated browser session was available. Owner download/action styling, full session restoration, physical Zebra and multi-PC acceptance remain pending. Database-role authorization and workbook tests are documented separately.
- Production main rechecked after publication: `08843e42399b8830af6f0eb0773f04e0269cf0b6`, unchanged. Live Production Pages version endpoint could not be independently retrieved in this environment; do not claim a fresh served-asset parity check.
- Migration applied only to Staging: `20261028012722_owner_global_items_export_v1`. No retained synthetic operational/identity/permission writes; both SQL validation transactions rolled back.

The follow-up documentation commit records this verified runtime deployment; its commit SHA is reported separately from the runtime SHA. Use the immutable URL above to test the verified runtime, not a moving alias. No merge to main or Production release is authorized.
