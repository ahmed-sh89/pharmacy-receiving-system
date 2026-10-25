Production Authorization release — 2026-10-25

Approved Staging: 6314cc1900095625ef1ade06181cb03d50c17587.
Production source parent: bd20065f0a2c7bb44861df88e1d021225e7c9725.
Supabase: zznoshzcyxmtwfbznjyr. Atomic migration 20261025115032 authorization_permissions_release_20261025 committed all 14 approved SQL files. Migration history retains each original SQL file.

Verified: preservation fingerprints unchanged for accounts/memberships, legacy history, Receiving orders/transactions/archives and Global Master. All 46 legacy sessions retained. Five pharmacy permission records seeded; HHP084 PHARMACY_GLOBAL initialized once and thereafter controlled by its UUID permission row. Eleven retired RPCs deny anonymous/authenticated execution. Production count RPC retains integer return contract. Admin claim only reads a trusted existing user-ID binding and cannot grant/reassign membership. Password administration Edge Function version 5, verify_jwt=true.

Read-only principal tests passed for existing System Administrator listing and existing Pharmacy Admin permissions, Manifest/History/Expiry reads and cross-pharmacy denial. Source is the approved Production patch, built against the exact Production parent and configured only for Production Supabase. Deployment identity and interactive browser smoke remain to be verified after this commit. USER VERIFIED is pending Product Owner acceptance.

Recovery snapshots are retained separately. Security policies and legacy retirement must remain during forward recovery. Do not restore email-only Admin claiming or anonymous legacy access. Do not reset operational records. Native browser deployment checks and physical Handheld behavior are not established by SQL principal tests.
