# Duty checkpoint — 9 November 2026

## Duty final grid separators — READY FOR USER TEST — 9 November 2026

Existing Draft PR #53 only, branch `fix/duty-exchange-staging-20261109-v2`; starting HEAD `c47a9c05339875bc2a4efbbcef23181a98994358`. Production main `c68a940fecd9d40b57b625769e9a4654991b6010` unchanged. Prior Duty interaction, Exchange, Ctrl+Drag/range separation, Today, toolbar/paging, KPI/Total and Reports styling are now explicitly **USER VERIFIED PASS**.

Consolidated owning 1px grid borders: vertical #91abc4, daily horizontal #cbd9e6; removed redundant employee-border override. Application changes only CSS and cache key. Calendar Settings behavior accepted unchanged: reverse saved Public Holiday configuration there with Save, not Schedule Undo.

New Chromium before/after at 75/80/90/100% PASS: exact unchanged 180-cell/grid/header/KPI/scroll geometry and special-day backgrounds; no overflow, 0 writes. Existing Exchange/interaction and Today/Reports browser runners PASS. Full Duty 120 PASS / 1 retained historical snapshot FAIL / 1 optional SKIP (122); auth/session/security regressions 63 PASS. Both builds PASS. No backend/calculation/data/Production changes. Final source/READY Preview/CI identity pinned in PR #53.

[Exact root cause, files, tests, before/after evidence and owner checks](GRID_SEPARATORS_20261109.md). Next: owner visual acceptance. Only after acceptance, separate read-only Production release readiness review; no merge/deploy authorized.
