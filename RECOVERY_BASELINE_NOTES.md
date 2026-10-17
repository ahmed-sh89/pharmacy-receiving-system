# PharmFlow Expiry reconstructed deployed-source baseline

Status: reconstructed baseline from verified Vercel source inputs. This is not the original `c7499fd47ba3479edd98708743efa434487e70ba` commit, and it does not restore that commit's Git tree or missing history.

## Provenance

- Historical parent: `819601240661dc2556133f4a7531ae20aac9fe29` (recovered integrated Production/Expiry baseline).
- Reported Vercel deployment source SHA: `c7499fd47ba3479edd98708743efa434487e70ba`.
- Reported Staging deployment: `dpl_Cmnfvio9PJqLQDVFgxD6yZjek2qZ`, READY, Staging; project URL `https://pharmflow-expiry-staging-fhyh2xtskz-3504.vercel.app/`.
- The recovered `original-uploaded-source/` package contains 64 original unminified build input files. The supplied raw SHA1 values match all 64 files; SHA256 and byte sizes were independently checked. The 49 local entry-point script, style, and icon references resolve.
- A clean copy built successfully with Node 24.19.0 using `npm ci --ignore-scripts` and `VERCEL=1 npm run build`.

## Reconstruction method

This commit has the historical integration commit above as its parent. It overlays the 64 verified source inputs at their original paths and adds this note. It does not apply the separately preserved old working-tree patches, merge Production, push, deploy, or modify a database. The older history bundle and original recovery package are retained alongside this repository in the recovery archive.

## Known limits

- The Git objects for `c7499fd...`, later documentation commit `5822dabc69904c30f6d75f5232a94b94bd2cb6af`, and intervening history were not recovered.
- The original source upload is a build-input archive, not the complete deployed commit tree. Tests, migrations, documentation, proposals, and other non-build files may be absent.
- Any later uncommitted or untracked files in the pruned original workspace are unknown. Older preserved patches are not assumed to be current and were not applied.
- Therefore this reconstructed baseline is suitable as a reproducible deployed-source starting point, but it is not proof that all latest development work has been recovered.

## Application readiness observations

- Expiry Inventory UI is present with search, date filters, selection/bulk actions, direct edit/resolve actions, pagination, and Excel/PDF/print reporting.
- The Inventory UI currently labels and filters the field as Category. This recovery does not implement or verify the approved canonical Global Master Group mapping/filter.
- Needs Review source is present, but its UI is explicitly disabled pending Staging backend-contract verification. This recovery does not establish backend readiness or Product Owner acceptance.
- No database or deployment operation was performed.
