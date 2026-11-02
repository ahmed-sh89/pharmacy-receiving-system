# Three-fix visual polish verification — 2 November 2026

Final runtime tested: df2118744308b3388e9f64467fe9df5ce48e7d27, Preview dpl_xhvkDVcQ3EG5ne2jTvVfudLTkWiL.
Tested URL: https://pharmflow-test-pzqym24k7-fhyh2xtskz-3504.vercel.app/staging/receiving-email-acceptance.html
Direct browser comparison used accepted baseline 2cb4772 at https://pharmflow-test-jws1h4kgp-fhyh2xtskz-3504.vercel.app/staging/receiving-email-acceptance.html and the unchanged realistic two-order fixture.

| Property | Accepted baseline | Final polish |
|---|---|---|
| Card dimensions | 124 × 86px each | 124 × 86px each |
| Badge top relative to card | 7px | 11px (4px lower) |
| Label weight | 400 | 600 |
| Orders label | rgb(23,61,99) | rgb(23,61,99) |
| Partial label | same blue | rgb(134,86,0) |
| Over label | same blue | rgb(22,99,75) |
| Summary/order bar height | 47px each | 47px each |
| Blue-bar computed text colors | parent cell black; font/children white by inheritance | cell, font, bold and nested span all rgb(255,255,255) |
| KPI values | 2 / -2 / +2 | 2 / -2 / +2 |
| Order tables | 2 × six columns | 2 × six columns |

The initial padding-only candidate temporarily measured 88px card height; it was corrected before delivery by preserving the rendered 42px badge row as 40px content + 2px inset. Final measured height is exactly the accepted 86px. No card enlargement retained. Label placement, card spacing, palette, quantities and header dimensions unchanged.

22 focused email tests PASS, covering the existing report/model/clipboard/Outlook action plus dark 600 labels, retained dimensions/alignment attributes, and own explicit white on every relevant header element in both generated and clipboard documents. Default and exact-branch Staging builds PASS. Static baseline comparison confirms unchanged KPI model/calculations, Clipboard API function, Outlook route helper and Arabic message typography. Served final SHA/source/Staging binding checked at delivery.

No authenticated corporate Outlook session was available for independent new paste/draft reopening verification. The owner's acceptance of the preceding layout and rich-copy behavior is preserved; the three visual changes, particularly white header text after normal Ctrl+V and draft save/reopen in narrow/full-width Outlook, remain PENDING PRODUCT OWNER CONFIRMATION. Browser computed colors and HTML tests are not an Outlook PASS. No repeated settings/auth investigation, hidden copy workaround, production/database/main change or release preparation performed.
