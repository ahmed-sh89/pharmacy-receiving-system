# Changelog — Global Master Group Gate B Preparation

- Added a six-value main Group normalizer. Legacy `category` is accepted as a Group only when it exactly validates to an approved main Group.
- Kept `HomeHealth` as the canonical database value and display `Home Health` in the UI.
- Added required Group controls to genuine Global Item creation in Settings and reference-pharmacy Receiving paths.
- Preserved prompt-free existing Global Item identifier linking and pharmacy-scoped identifier behavior.
- Added exact Global Item lookup before Receiving auto-creation; when the item exists, link it without Group. For a missing Global Item, request Group before invoking the server creation path.
- Added versioned `learn_pharmflow_identifier_v2`; the legacy RPC delegates to it and fails closed only when a missing Global Item would otherwise be created without Group.
- Added one reviewed SQL package with server validation, compatibility grants, an RLS-protected before-image audit table, safe legacy normalization, and the 61 workbook classifications.
- Corrected Receiving Group choices, report projection, item rows, and exports to use validated main Groups.
- Added automated tests for six Groups, fallbacks, filter behavior, Settings/Receiving flows, and SQL migration contracts.
- Final gate matched all 61 workbook item-code/name/classification rows to the SQL tuples after mapping workbook display `Home Health` to canonical `HomeHealth`; read-only checks confirmed the two PFTEST exceptions remain blank.
- Product Owner confirmed `9999982` was intentionally deleted; it is excluded from classification and no further deletion investigation is authorized.
- Added separate data-only recovery instructions. RPC enforcement remains in place during any client rollback. Isolated database execution remains blocked/unrun.
- No Production data, schema, deployment, or active Expiry source changed.
