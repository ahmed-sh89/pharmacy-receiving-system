# Account Production recovery release

Production parent: `9abf06bc249ecf5613e49adcb77b4b998e332959`.
Accepted Account source: `357d4845240c49e9fe20fb968030faa7492b37cc`.

Selective promotion only: approved Desktop header, Account/status popovers, password/edit dialog presentation, canonical Edit-feedback routing and one connection-renderer ownership guard. Existing AuthState, RPCs, permissions, Production Supabase client and GitHub Pages workflow remain unchanged. No SQL or database/data changes. Staging configuration, CSP, guards, migrations, diagnostics, demos and unrelated terminology/business changes excluded.

Handheld recovery: the existing Modes Sign Out and pending-work safeguard remain unchanged. A Modes Account button opens the canonical identity fields/actions in a Handheld-only accessible panel outside the hidden Desktop header and appPage containers. Existing AuthState controls retain unique IDs and handlers. No scanner, focus transport, quantities, Receiving/Expiry mode handlers or session semantics changed.

Pre-release checks: 61 focused automated tests PASS (Account including feedback binding order, existing auth tests, Receiving hydration/safety and Handheld scanner/Expiry tests); production build PASS. The historical first-character-reproduction fixture referencing unavailable commit `09640864` was excluded. The existing Settings test fails on both parent and candidate at the unchanged “Admins KPI must open a management view” assertion; no new regression there.

Browser layout evidence: isolated service-free source fixture with actual Modes markup/event dispatch, actual CSS and Account presentation scripts. At 360px, Modes Account and existing Sign Out are visible and clickable; Account/password controls reachable. Desktop header measures 60px and pharmacy-name center equals header center. Fixture uses mocked identity/actions; it is not authenticated verification. Physical Zebra verification not performed.

Activation: existing GitHub Pages main-push workflow stamps the final commit in `version.json` and the HTML build meta. Exact workflow/live-SHA results and non-destructive Production smoke are recorded in the release delivery. Do not infer authenticated Production PASS from static fixtures or Staging acceptance.

Rollback: revert this selective release commit on main through the same Pages workflow; no database rollback required. Preserve later work rather than resetting main.
