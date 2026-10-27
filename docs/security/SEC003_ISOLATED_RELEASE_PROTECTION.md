# SEC-003 isolated release protection preparation

27 October 2026. PARTIALLY VERIFIED, not DONE. No protection activated.

## Scope and current evidence

Base main: 6da2af6bac8c302e46a12cb9c95bb34cb67e3e19.
Disposable branch: security/sec003-release-protection-rehearsal-20261027.
Main protected:false; rulesets:[]; detailed protection GET returned403 Resource not accessible by integration. Repository metadata reports admin/push:true, but this does not grant the connector administration API access. No protection-write tool is exposed. Account billing/plan details are not available. Public personal repository: GitHub documents basic protection as available even on Free; no confirmed plan blocker. Named actor bypass configuration differs for personal and organization repositories; do not assume organization-only controls exist here.

## Prepared checks, no enforcement claim

New workflow runs only on this exact branch push or PRs targeting this exact branch. Unique check name: SEC003 isolated checks. Read-only contents permission; all unspecified token permissions none. No environment, secrets expressions, OIDC, deployment actions, reusable privileged workflow, pull_request_target, artifact uploads or cached authenticated checkout. Actions pinned to official tag commit identities. npm ci ignores lifecycle scripts; existing isolated regression fixtures and local build execute without server credentials. A source-level targeted client-secret marker scan is not a comprehensive secret/history audit.

vercel.json disables Git deployments for only this disposable branch, avoiding the linked Vercel automatic preview path. It changes no dashboard settings, main aliases or other branch behavior. Publish the first branch ref directly to the prepared commit containing this opt-out; never first publish the bare baseline. Do not blindly merge this rehearsal branch into main. Existing deploy.yml and expiry-photo-cleanup.yml remain byte-identical to main. Existing scheduled jobs are not dispatched.

Same-repository workflows do not automatically receive repository secret values unless referenced/passed, but read-only permissions alone are NOT an immutable secret-exfiltration boundary against a writer changing the workflow later. Before eventual activation inspect environment restrictions, secret scopes, collaborators and trusted workflow sources using administration access. No new secret capability is asserted here.

Local evidence:84 tests passed,2 private supplier-file cases explicitly skipped (fixtures not placed in CI). Build and artifact invariants passed without live accounts/data. Negative built-artifact tamper must fail the gate. GitHub-run checks and merge enforcement require separate live evidence; local command success does not establish either. SEC-004 tests were not repeated.

## Proposed branch-only protection (NOT applied)

Using supported GitHub administration, target ONLY this disposable branch with classic branch protection: require PR and one independent approval; dismiss stale approvals; require approval after the last push; require unique SEC003 isolated checks success against current base (strict); enforce admins; block force pushes and deletion; no bypass allowance. Require conversation resolution. Do not require signed commits or linear history without checking current release compatibility. No repository-wide ruleset.

With actual branch-only enforcement: (1) attempt an ordinary direct commit and record rejection; (2) PR with a deliberate isolated fixture failure stays unmergeable; (3) fix fixture, obtain a real independent review, confirm passing latest-head check and merge ONLY to disposable branch; (4) verify force-push/deletion protections from effective API config rather than attempting destructive operations. No PR to main and no Production dispatch. A same-user self-review is not approval evidence. These tests are NOT performed without administration capability.

## Final activation procedure, separate approval required

1. Obtain administration-capable connection and inspect current protection/environment settings, account eligibility and all automation identities. Verify no unexpected main drift.
2. Activate and prove the branch-only rule above. Identify independent reviewer and emergency operator; validate rollback permissions before protecting main.
3. Separately approve a narrowly reviewed PR carrying only the check workflow/script and operating documentation. Change workflow triggers to PR target main; do not promote the disposable Vercel opt-out. Verify GitHub executes the exact job and register its name/source as a required check before enforcement. Existing deployment workflow remains unchanged in this package; stricter deployment-environment gating is a separate approved decision after inspection.
4. Apply main-only protection requiring the proven check and review, enforcing admins, blocking force/deletion and restricting bypass where supported. No blanket writer bypass. Reverify standard reviewed release path and permitted rollback. No database changes required.

## Rollback and emergency procedure

No Production release occurs in this rehearsal. Baseline6da2af6b and runtime4c9de95e remain recovery references; this task does not re-certify old deployed artifacts. For later release regression: revert the specific release commit with a new ordinary commit on a recovery branch, obtain required checks and independent review, merge normally, then verify normal deployment and live SHA/environment. Never force-push or restore databases. Prevalidate that reversal remains schema-compatible.

Emergency fallback must be defined with an authorized repository administrator before activation: a documented time-limited exception for the exact recovery PR if ordinary checks cannot run, independently approved and logged, followed immediately by restoration/readback of protections. Do not disable protections broadly or assume the current connector can perform this. No exception is configured or tested here.

## Preserved open work

SEC-004 Staging33f19f67:16 isolated tests previously passed; authenticated acceptance BLOCKED for missing disposable Auth admin access. No Production promotion. Retain for consolidated acceptance.
EXPIRY-SAVE-001 OPEN: two physical units legitimate; no correction required. Stuck pending notification cause unconfirmed; no Expiry change.

## Sources

Original PHARMFLOW_SECURITY_FINDINGS_REGISTER.md SEC-003 and security continuation recommended order. GitHub live branch/rulesets/workflow reads. Official docs: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches ; https://docs.github.com/en/actions/tutorials/authenticate-with-github_token ; https://vercel.com/docs/project-configuration/git-configuration .
