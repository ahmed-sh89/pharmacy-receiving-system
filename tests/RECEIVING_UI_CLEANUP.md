# Receiving UI cleanup verification

Status: READY FOR TEST — not DONE.

Base: `93e2811042331603bb63d64f708c66881a4dd8c5`.
Test branch: `codex/receiving-ui-root-cleanup`.

## Root cause and scope

The rejected preview (`6c647a6`) reproduces the reported 17-case / 42-quantity
blank list in an offline browser fixture. Summary text exists with real values
and visible computed text styles. Its button is 63px high, but each grid row is
only about 25px high at 1440×900. The compact row's `overflow:hidden` clips its
contents because the constrained list uses automatic grid tracks. This is a
layout sizing failure, not a data-mapping failure. Color/visibility/z-index
overrides do not fix it.

The production component now owns a content-sized scrolling list with
`grid-auto-rows:max-content`, an unclipped summary, and a separate collapsible
detail grid. Existing detail controls, photos, quantities, original-order lookup
and resolution handlers are retained.

The shell now has one header grid, one compact status-group rule, a centered
pharmacy identity, and a pre-existing DOM target for the unmodified cloud-status
renderer. The footer code is populated by loaded `ui.js`; the former code setter
exists only in unloaded root `app.js`. The picker no longer applies full-width
row styling to action buttons. The two-line identity/master cards and the
desktop breakpoint hiding the master status were removed. No rejected preview
override blocks or `pfnStatusTile` patches were imported; no new `!important`
declarations were added.

## Checks

- `node --test tests/receiving-ui.browser.cjs`: 3 passed in headless Edge with
  all network requests blocked. Uses actual loaded styles, production grouping,
  review rendering, header identity rendering and picker markup.
- The 17-case fixture verifies actual summary values and child rectangles
  inside every row after scrolling, plus mouse/keyboard expansion and History.
- Desktop checks at 1024, 1100, 1280, 1440 and 1920px verify status heights and
  alignment, compact header, centering, no KPI overlap, footer code, and compact
  picker actions. A 390px fixture verifies expansion and hidden Handheld History.
- `node --test tests/*.test.cjs`: 38 passed, 5 failed. Reading the same tests'
  source inputs directly from the untouched base with Windows checkout line
  endings gives the identical five failures:
  - desktop manual receiving CSS string expectations;
  - startup cache-version expectation;
  - desktop polish CSS string expectations;
  - V2-resolved identifier fixture: `window is not defined`;
  - coherent startup cache-version expectation.
- `pnpm run build`: passed using Vite 8.3.0 (allowed by the existing version
  range). Vite reports the existing classic scripts cannot be bundled without
  `type="module"`; this build is not a deployment verification.
- `node --check ui.js`, `node --check tests/receiving-ui.browser.cjs`, and
  `git diff --check`: passed.

To run the browser test, provide Playwright via normal module resolution or set
`PLAYWRIGHT_MODULE` to its installed package path. Edge is the default browser;
`BROWSER_CHANNEL` can select another installed Playwright browser channel.
`UI_SCREENSHOT_DIR` optionally specifies an existing evidence directory;
otherwise screenshots go to a temporary directory. The fixture never starts
the authenticated application or loads Supabase.

## Product Owner verification and unresolved baseline mismatch

The requested PC selected-order Needs Review filter and Handheld view-only
guards are present on the rejected preview branch but absent from the specified
production base. This UI cleanup retains the base's scope and permissions logic;
it does not import the preview's operational changes or SQL. Therefore those
two requested behaviors are **not established by this change** and need an
explicit decision about carrying over the preview guards before release.

Visual acceptance on the test deployment, real Zebra scanner/focus/keyboard
behavior, photo loading, authenticated identity hydration, synchronization and
Link & Resolve were not exercised against live data. Main and Supabase were not
modified, and nothing was pushed, merged or deployed.
