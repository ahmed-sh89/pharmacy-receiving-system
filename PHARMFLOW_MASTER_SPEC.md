# PHARMFLOW MASTER SPEC — CURRENT OVERRIDES

Updated: 21 August 2026

These approved decisions supersede older conflicting Session/Handheld wording in historical PharmFlow documents.

## Unified Pharmacy Workspace
- PCs and Handheld are clients of the same pharmacy/account-isolated Supabase authoritative workspace.
- Handheld Receiving must not require user-facing Create Session, Join Code or QR pairing.
- Handheld remains the primary mobile operational device; generic phone optimization is deferred unless it does not delay the core project.
- Supabase/server state is authoritative. Local browser state must not become a competing source of truth.

## Handheld UX Direction
- Simple professional Modes screen: Receiving / Expiry.
- Receiving READY only when actual Active Order data is synchronized.
- Scan surface uses a visible scanner beam/ready state and must not summon soft keyboard.
- Numeric keyboard appears only for operational numeric entry and must not be destabilized by scanner autofocus.

## Needs Review Direction (planned 2C.11.2)
- Professional simplified PC workflow, photo open/zoom, real uploaded-order Item Name/Code search, Link GTIN & Receive, Known Extra Add & Receive, multi-order target handling, New Item only when truly new.

## Expiry Capture
- Medicine GS1/2D: auto-extract available item identity, batch, expiry and serial; worker enters Quantity only then Save.
- GTIN-only: worker enters Quantity and chooses Month (1–12 rendered Jan–Dec) and Year from dropdowns.
- Expiry report filters by selected month(s), category and worker; Medicine shows name/expiry/qty/batch/serial when available; cosmetics/accessories show captured fields.

## Item Movement
- Uses original document Ordered Qty, NOT actual Received Qty.
- Normal Orders contribute original Ordered Qty.
- Movement-only transfer files use separate bulk import and must not become Active Orders.
- Preview appears in PharmFlow before export; supports multiple selected items, one summary row per item and drill-down Date / Source / Order-Transfer / Qty.
- Persist normalized movement rows; avoid permanent Excel binary storage unless later required.

## User-facing terminology / navigation direction
- Prefer `Order History` instead of `Archive` in UI. Internal DB table names need not be renamed.
- Legacy Session controls should disappear after Unified Workspace verification.
- Return Archive should be hidden from current navigation without destructive deletion of its independent data.
