# Enterprise Expiry — authenticated visual QA, 14 October 2026

Verified deployed SHA cd3fbafcce6dc8102500787a7c7141e42c11aa3d; Vercel dpl_4y7BCATEV4FHWYecqUai9QoX2ZgB READY Preview on pharmflow-test. Browser loaded EXPIRY_ENTERPRISE1. No source edits, deployment or Supabase writes during this inspection; backend proposal still NOT APPROVED/NOT APPLIED.

Actual viewport1363x936; document scrollWidth1363/scrollHeight936. Mandatory1366x768 and larger Windows viewport UNVERIFIED because no supported resize API exists. No screenshots resized or synthetic state injected.

Eight actual Staging screenshots: Scan/toolbar/empty six-column table; enteredDom text with one result; recognizedDompy; multipleTab results; amberNeedsReview; Inventory; inactiveInventory hover while Scan selected/focused; GS1 parsedBatch/Serial/date. These supersede the prior login blocker for the available viewport only.

Observed: compact single toolbar, restrained tabs with subtle active background and3px purple underline; selected state preserved while other tabhovered. Read-only DOM confirms selectedScan backgroundrgb241/237/255 and purple border while hoveredInventory remainsneutralrgb241/243/248 with transparentborder. ArrowLeft tab navigation works.16px entered scan text; name/code/GTIN readable and together; Dom single-result ArrowDown/Enter selection and FLUTAB mouse selection from two results both load correct item. Knowngreen check-circle and unknownamber triangle inspected. Serial input visible and GS1 exactVISUAL-SERIAL, BatchVISUAL-BATCH, month2/year2027 populated without Save. Temporary drafts cleared.

Inventory reads30 existing records/96units, four KPIs, selection/export/print/actions/pager retained, current-session metrics hidden. Count10 NeedsReview present before/after unknown draft; no review case created. GlobalMasterUNAVAILABLE badge remains priorknownissue. Current signed session has0captures and metrics0/0; populated session grouping/disabledbuttons remain UNVERIFIED visually. Did not save test captures, manipulate auth scope or fabricate rows to populate them. No redservererror induced. Long/alphanumeric values and scope/group controls remain covered automatically, not newly rendered visual evidence.

Frontend READY FOR USER TEST at available viewport; exact1366x768 acceptance still pending. Group Edit/Delete BLOCKED PENDING BACKEND APPROVAL. Overall NOT DONE. Existing automated evidence161focusedPASS/0FAIL/1SKIP and610fullPASS/43baselineFAIL/1SKIP; buildPASS unchanged by this read-only inspection.

Next acceptance: user inspects actualWindows1366x768/larger and operational populated current-session groups; separately review/approve docs/expiry-group-rpc-approval.md before Staging migration/UI enablement. Secure login confirmation is not backend approval. Keep Production untouched.
