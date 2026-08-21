# PHARMFLOW CHANGELOG — 2C.11.4.3

- Fixed Dompy Handheld Batch truncation when the legitimate Batch contains `17`.
- Separator-loss recovery now evaluates all structurally valid AI17 candidates
  and chooses the rightmost valid boundary.
- Preserved general GS1 parser and all normal FNC1 paths.
- No SQL migration.
