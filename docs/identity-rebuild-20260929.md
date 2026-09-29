# PharmFlow visual identity rebuild — READY FOR TEST

Branch: `fix/idle-ui-short-scanner-20260929`.
Baseline: `aa8e75db23f8b16331e2dabd52cbf1db939cd258`.
Production/main remains `3a8e77f3dc41be09b8cc5d77f2109cc5586b3e55` locally.

## Root causes and evidence

- `js/app.js:applyBrandIdentity()` replaces every `[data-brand-name]` element's children with text. In the baseline browser, the login wordmark became plain `PharmFlow`, erasing its colored spans. Removed that plain-text binding from the deliberately split login wordmark; application/authentication JavaScript is unchanged.
- Login scanner's `left:-26px!important` defeats its animated `left`. Browser phase sampling returned `-26px` at both 0 and 3500ms. New owner returns different positions and respects reduced motion. The old float moved only 2px and the actual mark was only 56px at the normal desktop viewport.
- `pharmflow-next.css` also supplied logo sizes, a monochrome filter, wordmark sizes and typography after `auth.css`. Removed these competing brand rules. Form/layout declarations that still contributed to the computed layout were moved into `auth.css`; they were not discarded or replaced with another override layer.
- Root `cloud-workspace.js` is the active idle DOM/controller. Its injected CSS referenced unhashed `assets/capsule-blue-half.svg` and `assets/capsule-pearl-half.svg`. Both return HTTP 404 on the baseline Vercel preview `pharmflow-test-619cc6dtx-fhyh2xtskz-3504.vercel.app`. Vite processes CSS asset references, but cannot rewrite URLs hidden inside a classic JavaScript CSS string. The baseline idle transform does animate locally (0 to -9px); missing deployed artwork explains why source animation alone did not establish visible deployed motion.
- Loading used stretched gradient SVG halves and 7–12px CSS pills; its material and tiny particles caused the illustrative appearance. Loading lacked its own reduced-motion rule.
- The idle hierarchy used a 35px title, 39px brand, decorative divider, multiple floating objects, and a large button. It now uses a 23px title, 36px brand, one closed capsule, and a compact 50px button.

## Ownership and exact changes

- `css/identity.css` (added): sole active owner of login branding/background artwork, both existing loading capsule instances, and Session Paused visuals. Shared palette/material and separate scan/open/float animations. No `!important` declarations.
- `css/auth.css`: removed old logo/name/tagline/background artwork/keyframes; owns existing login layout/forms, including contributing form rules relocated from the shell stylesheet.
- `css/pharmflow-next.css`: removed login brand overrides and relocated contributing auth layout/form rules. Non-auth rules verified unchanged using parsed CSS comparisons.
- `css/dashboard.css`: removed obsolete auth theme fragment. Non-auth rules verified unchanged.
- `css/responsive.css`: removed old loading owner and keyframes; retained Handheld bootstrap visibility rules and all operational styles.
- `cloud-workspace.js`: simplified decorative overlay markup, removed divider and injected stylesheet. Everything outside `ensureOverlay()` is byte-equivalent after line-ending normalization. The button's existing reload listener is unchanged.
- `index.html`: loads identity stylesheet; uses larger login mark; preserves split wordmark markup; updates changed file cache keys. Form IDs, fields, handlers, boot classes, and loading text are unchanged.
- `tests/identity-browser.cjs` (added): offline Edge/Playwright checks with all external requests aborted.
- `.gitignore` (added): excludes dependency/build folders and local review screenshots.
- This report (added).

Assets added:

- `assets/pharmflow-login-mark.svg`: native SVG barcode/P/capsule mark, with the actual mark occupying most of its view box.
- `assets/pharmflow-capsule-studio.png`: transparent studio capsule; reused for closed idle, clipped loading halves, miniature capsules and blurred login background.
- `assets/pharmflow-tablets-studio.png`: transparent two-cell blue/pearl tablet sheet for visible falling tablets.

Assets removed: `assets/capsule-blue-half.svg`, `assets/capsule-pearl-half.svg`. Repository search established these were used only by the replaced visual rules. Existing global logo assets remain in use and were retained. Unloaded historical files/nested application copies were not deleted.

## Verification

- Vite **8.2.1**, installed from the existing npm lockfile, preview-root build passes. Existing warnings about classic scripts are expected; the existing build plugin copies their runtime files.
- Changed CSS parsed with PostCSS; changed JS/test syntax and `git diff --check` pass.
- Browser tests run against the actual entry and scripts and against built `dist`, with external CDN/Supabase requests blocked. No page errors or missing local assets.
- Navy/blue computed wordmark colors; enlarged logo with no monochrome filter; distinct scanner phase positions.
- Loading starts closed, opens, shows at least three visible pills, closes at the loop boundary; wall-clock motion confirmed.
- Idle wall-clock motion and smaller title verified. No horizontal overflow; Resume fits at 1440×900, 1366×768, 390×844, 360×640 and 320×480.
- Reduced motion disables login/loading/idle animations and hides falling particles.
- Show/hide password, Remember email checkbox, Register Pharmacy and Activate Admin navigation, Resume button reload and Enter reload pass. A virtual-clock test verifies idle activates at exactly 600000ms, not 599999ms.
- Startup, Receiving safety gates, and Handheld scanner rearm checks pass. Of 11 selected existing checks, 10 pass. One existing Order Item Browser assertion expects `.smartSearchResult .pfnSearchQtySplit{display:flex;flex-direction:row;`, which is absent from the baseline HEAD too. No unrelated Receiving change was made to satisfy this stale assertion.
- Source audits confirm one active identity owner, no old capsule asset references, and no changed business/authentication scripts outside the idle overlay renderer.

These are offline UI/build/controller checks, **not a successful live account sign-in or authenticated receiving-workspace hydration test**. Supabase data/schema/auth configuration were not changed. Production/main and production deployment were not modified.

## Product Owner visual/session checklist

1. On the new test preview at the normal PC viewport: confirm larger barcode/P logo, clear navy/blue wordmark, subtle visible background capsules, and scanner sweep after a few seconds.
2. Sign in with an approved test account; confirm Remember email, password toggle, Forgot Password, registration and activation flows remain correct. Avoid sending recovery emails unless intended.
3. Refresh an authenticated test workspace; inspect the closed → open → falling pills → close sequence if loading lasts long enough. Confirm one loading surface and normal workspace hydration.
4. Leave the test session inactive for 10 minutes; confirm compact paused card, visible closed-capsule float, readable pearl half and smaller title. Confirm Resume reloads back to the normal session.
5. Enable OS reduced motion; confirm the visuals remain clear without movement.
6. Approve the visual quality before considering any release promotion. Status remains READY FOR TEST.

## Asset provenance

Both PNGs were generated with the built-in imagegen tool, copied into repository assets, and retain their generated alpha. No external image URLs are needed at runtime.

Capsule prompt:

> Use case: product-mockup. Generate a reusable pharmaceutical UI asset: one closed premium realistic 3D hard gelatin capsule, horizontal perfectly straight side view, blue LEFT half (#0879e8) and pearl-white RIGHT half. Natural capsule length to diameter ratio 2.8:1. Perfectly semicircular rounded ends; seamless coherent shape with a subtle overlap seam at exact center. Studio product photography, realistic glossy gelatin, broad softbox highlights upper left, delicate fine material texture, dimensional seam, pearl half softly shaded blue-grey along lower edge to remain visible on a pale page. Orthographic camera, no perspective foreshortening, centered. Transparent background, tightly framed capsule with ample transparent margins. No ground plane, no cast shadow outside capsule, no text, no watermark, no extra objects. This image will be reused at 220px width, and its two aligned halves clipped in CSS to animate opening, so the seam must be vertical at image center. Output a landscape image.

Tablet prompt:

> Use case: product-mockup. Transparent pharmaceutical UI sprite sheet, exactly two isolated realistic small round biconvex tablets on a transparent canvas, no text. Landscape 2:1 canvas split into two equal square cells. Center of LEFT cell: a rich PharmFlow blue (#0879e8) round tablet with subtle score groove. Center of RIGHT cell: a pearl-white round tablet with subtle score groove, blue-grey sidewall shading. Identical size and angle, each object occupies 70 percent of its square cell. Real studio product photography with softbox upper-left highlights, clearly visible bevel and thickness, premium smooth pharmaceutical material, slightly elevated three-quarter view. No ground, no background, no external shadow, no extra objects. These will render at 20px diameter, so simple strong silhouettes with excellent depth and pearl edge contrast. Actual alpha transparency.

Run: set `PLAYWRIGHT_MODULE` to an installed Playwright module if not on Node's module path, then `node tests/identity-browser.cjs`. Set `IDENTITY_BUILD=1` to test `dist` after a preview-root build. Screenshots are written to `output/identity-review/` and are intentionally untracked.
