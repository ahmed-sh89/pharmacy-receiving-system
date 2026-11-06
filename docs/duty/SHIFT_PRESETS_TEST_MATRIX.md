# Shift Presets focused test matrix

| Requirement | Automated evidence | Browser status |
|---|---|---|
| Durable scoped CRUD / CAS / saved entries unchanged | duty-presets-database.test.cjs PASS | Owner refresh / two sessions required |
| Single/split/overnight normalization and calculations | DB and established scheduling checks PASS | Owner required |
| Quick Shift / manual adjustment / explicit Save / conflict | duty-presets-ui.test.cjs PASS | Owner required |
| Multi-cell preview / overwrite cancel / batch / Undo conflict | duty-presets-ui.test.cjs PASS | Owner apply / Undo / Redo required |
| Seven migrations atomic visibility/history/rollback | Actions 42227797916 PASS | Not applicable |
| Receiving/Expiry/auth preservation | 58 neighboring checks PASS; release protected hashes | Prior owner evidence preserved |
