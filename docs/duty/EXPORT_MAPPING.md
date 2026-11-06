# Duty external-output mapping — preparation only

No export/direct workbook-write integration is released in Stage B. Original references unchanged; no staff import. Future output must be a new values-only file or selected clipboard values, never an automatic write into external formulas/formatting.

A.xlsx has A–L human-facing fields and R–Z helper/source fields. A3/B3 and A4/B4 contain month/year controls, so A is not a uniformly writable per-record Store column. C and U/V date representations disagree with some displayed weekday/month labels. Do not use those inconsistent values as date authority.

| Canonical field | Observed external field | Safe later-stage treatment |
|---|---|---|
| Pharmacy code | A1 Store, A2 selected store; S helper | Explicit output metadata; never overwrite controls |
| Employee code | R ID | Stable text code in new output; do not overwrite helper ranges |
| Duty start date | C Day; U/V helpers | Generate typed date from canonical ISO date; validate destination convention |
| Weekday | D Day Name | Derive from destination start date |
| First period | E Check In 1 / F Check Out 1 | Typed time values shown AM/PM; blank when absent |
| Second period | G Check In 2 / H Check Out 2 | Typed times; breaks excluded; overnight offsets retained internally |
| Normal OT | I Normal O.T | Integer minutes converted to decimal output hours |
| Friday OT | J Friday O.T | Exclusive Friday-start category |
| Holiday OT | K Holiday O.T | Exclusive non-Friday marked-holiday category |
| Notes/status | L Notes / Coverage Pharmacy | Escape spreadsheet expressions; preserve leave distinction |
| Human-readable duty | T Time Table helper | Derived AM/PM string in new output only |
| Basic/Total worked | No confirmed A–L destination | Named standalone fields; do not invent a target column |

B data, M In-Out, N/O grouping and W–Z outputs are not confirmed writable destinations. Validate active destination identity/date convention before claiming compatibility. Planning workbook historical/helper sheets inform layout, not calculation authority. Planned and confirmed-actual data must remain distinguishable in future reporting.

## Final single-employee range (6 November 2026)

Copy Values remains exactly E:L. A custom interval emits only those dates in calendar order, with no blank padding before/after it. Paste values in column E on the selected employee's row matching the interval's first date; never assume E2 for a later employee or date. Full Month preserves its original daily rectangle. The preview, period KPIs and both exports use the same filtered projection. Notes contain only saved notes. Standard export keeps reserved M:O blank and generates real selected-period dates. The supplied A(3).xlsx has inconsistent underlying date serials and non-November metadata, so verify the actual template calendar before pasting; the module does not write to the online sheet.
