# Receiving Email selective release preflight — 2 November 2026

## Authorization boundary

Preparation only. Product Owner explicitly accepts Staging cd32338f530a9223be1775244f00fb4b33264517, including real Outlook Web Copy Email -> Ctrl+V PASS with Default Paste = Keep Source Formatting. Do not repeat visual acceptance or modify accepted design. No Production merge/deployment/configuration/data changes performed or authorized by this preflight.

## Verified baseline and exact candidate scope

Current origin/main:5b963d82501a317790f5ece8e5552b4a09a5886e. Official Production https://ahmed-sh89.github.io/pharmacy-receiving-system/version.json reports this same SHA. Served js/orders.js, css/dashboard.css and css/pharmflow-next.css exactly match origin/main. Accepted commit exists and is the HEAD of feature/receiving-email-staging-20261101 when prepared.

Release branch:release/receiving-email-prep-20261102, based directly on verified main. One isolated squash/snapshot commit is proposed, not a merge of the Staging history. Three runtime files are byte-identical to accepted cd32338:

- js/orders.js: accepted email-only model/subject/HTML/plain-text renderer, rich copy and Outlook Web preview action. Functions before the email presentation boundary and after bindFinalizeReceivingUI remain source-identical to Production; existing canonical grouped report source is retained. Accepted unit KPIs/signs and zero suppression unchanged.
- css/dashboard.css and css/pharmflow-next.css: only accepted retired-email selector cleanup. Still-active preview-shell selectors/declarations/order/media context unchanged.

Non-runtime files:tests/receiving-email.test.cjs, tests/fixtures/receiving-email.fixture.js, this release plan. The fixture function is extracted verbatim from the accepted synthetic Staging page; tests change only its loading path. No synthetic operational records are created. Pages runtime allowlist excludes tests/fixtures/docs.

Staging lineage reviewed (85ee4be..cd32338,17 commits):85ee4be,6089b3b,d378b24,bd18e29,2b2ef9a,9fd0edd,255f8e1,fd50498,218e2bd,db62a72,2cb4772,17c6298,df21187,757285c,bcb25f7,19b9267,cd32338. Only final accepted net runtime contents are included. Discarded design snapshots/screenshots, stale Staging checkpoints, Staging helper page and Staging-specific vite.config.js changes are excluded. No unrelated Receiving, Expiry, Security, SQL, environment, dependency or workflow change.

## Local verification

- Focused email suite:25/25 PASS, including real accepted two-order fixture, unit KPI values2/-2/+2, single authoritative HTML path, text/html+text/plain, Arabic/English escaping/direction, dates/subject, six fields, category colors, header typography, ice-blue background, intrinsic Code sizing, unmodified Outlook action, fallback behavior and no active/tracking content.
- Existing PR workflow's exact offline suites:164 PASS,2 SKIP,0 FAIL (166 tests). The two optional real-supplier Excel fixtures TO-000529235.xlsx and TO-000528294.xlsx are absent; all synthetic/mandatory fixtures passed.
- npm run build:PASS using unchanged Production baseline Vite config; no publication.
- scripts/build-pages-artifact.cjs:PASS; all three runtime files in artifact byte-match accepted Staging; no tests/staging/docs/supabase/.github/node_modules in artifact.
- Release-branch Vercel Preview build negative test:PASS (fails before publication with Production release requires main and Production configuration).
- Remote PR CI (including existing advisory inventory) is checked after PR creation; exact result is reported with final delivery. No additional audit or unrelated tests introduced.

## Deployment isolation

Database migrations:NO. New environment variables:NO. No changes to either Supabase project. Production index/client/config files are identical to verified main; release code adds no backend path or operational calculation/write.

vercel.json remains exactly {"git":{"deploymentEnabled":{"main":false}}}. Current project pharmflow-test is the Vite test project (Node24), latest accepted deployment is Preview target/null, not Production. Release keeps main's original build guard: any Vercel build requires VERCEL_ENV=production AND ref=main, while Vercel's Git configuration disables main deployments. Thus branch/PR Preview builds are intentionally rejected; no attempt is made to weaken this guard to generate a release preview. Existing dedicated Staging preview remains separately bound to tovkcakucyagvbzvlnks. No Vercel API/configuration update, promote or deployment action performed.

GitHub Pages deploy.yml runs on push to main or separately authorized workflow_dispatch; PR opening/branch push does not publish Pages. On future explicitly approved merge, the existing workflow stamps the actual merge/deployed SHA and publishes only its runtime allowlist. No new workflow required. Existing unrelated cleanup schedule remains untouched.

## Approval gate and future release steps (not executed)

READY for exact-candidate approval only after required PR CI succeeds. Immediately before merge, recheck main remains5b963d8 and release HEAD is the approved exact SHA; stop/re-preflight on drift. Product Owner must explicitly authorize the exact candidate merge and GitHub Pages deployment. Do not dispatch deployments during preparation. After authorized merge only, verify Pages run succeeds, served version equals resulting merge SHA, Production binding remains zznoshzcyxmtwfbznjyr and three email runtime files match candidate. Use non-destructive smoke checks; no automatic emails or operational test writes.

## Rollback

Verified recovery baseline:5b963d82501a317790f5ece8e5552b4a09a5886e. If required after an explicitly approved release, prepare a separate reviewed revert PR for this isolated email commit, preserving all unrelated Receiving/Security/Expiry changes. If main has advanced, restore only the three runtime email files from that baseline rather than reset main or revert intervening work. Obtain separate explicit rollback authorization, then use the same Pages path and verify served SHA/content. No DB rollback/migration/receipt correction is required; existing ledger/audit data are untouched. Previously copied/sent messages are not modified by application rollback.
