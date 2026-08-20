PHARMFLOW PHASE 2C.10.6.1
ZEBRA INPUT + RECEIVING ROOT FIX

STATUS: READY FOR TEST

This phase is based on measured Zebra browser events, not timing assumptions.

Modified production files:
- index.html
- js/scanner.js
- js/receiving.js

No SQL required.

RECAPPED COMMIT SUBJECT
Fix Zebra receiving pipeline

EXTENDED DESCRIPTION
Phase 2C.10.6.1
- Consume complete Zebra GS1 from atomic browser input events
- Stop using key timing to define Handheld scan boundaries
- Clear scan input before processing to prevent apparent freeze
- Resolve current-session/current-order GTIN mappings first
- Use full Global Master only as fallback for extra/unknown items
- Preserve desktop Receiving search behavior and verified item #24
- No SQL migration
