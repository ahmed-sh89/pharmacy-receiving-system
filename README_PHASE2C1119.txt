PHARMFLOW 2C.11.1.9 — HANDHELD SCAN ACK + FRIENDLY DEVICE LABELS

Upload/replace ALL files in this ZIP at matching paths.
No SQL migration.

Changed production files:
- index.html
- js/ui.js
- js/receiving.js
- js/cloud-workspace.js
- js/handheld-runtime.js
- css/dashboard.css

EXPECTED HANDHELD FLOW
Physical 10 packs:
1. Scan first pack -> +1 saved and visibly confirmed.
2. Tap local quantity.
3. Enter remaining 9.
4. Press Enter.
5. Local Handheld batch = 10.

DEVICE DISPLAY
Raw DEV-UUID values remain internal only.
Visible history uses friendly labels such as Handheld / PC / This PC / Other Device.

RECAPPED COMMIT SUBJECT
Clarify handheld quantity flow

EXTENDED DESCRIPTION
- Show explicit first-pack scan acknowledgement
- Make manual entry clearly mean remaining/additional packs
- Prevent accidental double counting from a default extra 1
- Hide raw device UUIDs from PC and Handheld history
- Persist friendly device type metadata without schema change
- Preserve verified sync and idle recovery
