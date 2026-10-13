# Expiry Enterprise refinement — 14 October 2026

Starting deployed/GitHub SHA b11503c49b228728faad97269435a6218dd6f913, READY Preview dpl_5c5ApHvJAzHLwQXiUCJnRSgagujP. Preserved local383950343ad4df94bdd35824361f5f5de9b907c8 has identical tree7145048fe9395911b5295590197a44cebc2ed863. Tracked starting tree clean; untracked supabase/.temp/ retained. Source bundle retained.

Only feature/expiry-stage1-visual-gate, Vercel pharmflow-test and Supabase tovkcakucyagvbzvlnks. Production main/Supabase untouched.

Root causes corrected in canonical index.html, css/dashboard.css, js/expiry.js and js/expiry-desktop-v2.js: redundant capture heading and separate summary tier; old segmented navigation and selected/hover specificity; undersized input/results; distant unlabelled result code; combined session product column; oversized empty session panel. One toolbar now contains enterprise tabs, session-only metrics and Review. Metrics hidden in Inventory. One scanning container with serial input preserved; entered text16px, readable result name/identification grouped together. Desktop manual result arrow/Home/End/Enter selection follows existing identifier lookup, without changing matching, debounce or hardware suffix routing. Six session columns exactly Item Code / Identifier, Product Name, Batch, Expiry, Quantity, Actions. Group latest time is max actual captured_at. Edit/Delete visibly disabled, no preview-only write controls. Source grouping still uses authoritative canonical state IDs and signed session only. No raw capture/serial/Inventory API or Handheld behavior changed; summary remains Desktop-only.

Baseline focused157/0/1. New focused161PASS/0FAIL/1SKIP; full610PASS/43FAIL/1SKIP versus baseline606/43/1; all failing names identical. Build PASS. New tests cover toolbar/context, exact columns, latest group timestamp, leading zeros, disabled no-write controls, manual keyboard result selection/long/alphanumeric values, and local proposed atomic SQL semantics.

Backend proposal is review-only: docs/expiry-group-rpc-approval.md and proposals/staging/expiry-group-correction-proposed.sql. Local PGlite tests do not authorize or prove a deployed RPC. No Supabase migration/RPC/data write. Grouped mutation BLOCKED PENDING BACKEND APPROVAL.

Rendered Staging QA is pending candidate deployment. Available Cloud Browser previously1363x936 with no resize API; mandatory1366x768/larger remains UNVERIFIED unless actually available. No calculated geometry or synthetic DOM screenshot constitutes Staging visual approval. Populated current-session groups require real existing session captures; do not manufacture data or mutate database under UI-only approval.

Ending runtime SHA, actual viewport/screenshots and visual findings will be recorded after deployment. Overall NOT DONE until Product Owner acceptance. Inventory Year→months remains deferred.
