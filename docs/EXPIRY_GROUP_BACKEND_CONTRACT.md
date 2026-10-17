# Expiry Inventory canonical Group backend contract

The existing `query_pharmflow_expiry_inventory_v1` response exposes the legacy `department` field and department facets. The approved Group UI must not infer a canonical value from that field. The existing migration's `inventory_rows_v1` currently coalesces Global Master `group_name` with the expiry row's legacy `category`, so callers cannot distinguish canonical Group from fallback Category.

Before the Group UI can be deployed, the Expiry backend must provide one server-authoritative contract:

- Inventory query rows and export rows include nullable `group_name` sourced only by matching `pharmflow_global_items_v2.item_code` to the expiry row's `item_code`.
- Query responses expose the six canonical Group facets and `has_unassigned_group` based on the complete authorized dataset, independent of visible page, search, date, or Group filters.
- Query filters accept `groups` (canonical stored values) and `include_unassigned` (NULL or noncanonical Global Master Group). When either is selected, the RPC applies their union together with search/month filters before counts, totals, sorting, and pagination.
- Selection preview and Excel/PDF/Print export use the same matching semantics as the paged query. Export rows also include nullable `group_name`.
- Rows with missing Global Master mapping or invalid `group_name` remain explicitly unassigned/unmapped. The backend must not fall back to expiry `category` or legacy Global Master `category`.
- Every Inventory, preview, and export RPC continues validating the authenticated user's membership in `p_pharmacy_id` and constraining all expiry rows to that pharmacy. Global Master lookup is by item code and must not widen expiry row scope.
- RPC execute permissions remain restricted to `authenticated`; private tables stay inaccessible directly. Verify the existing RLS, GRANT, and SECURITY DEFINER/search-path contracts when the database migration is separately authorized.

No SQL has been prepared or executed in this task. The Staging metadata API currently denies the read-only audit, so migration dependencies and exact deployed definitions still need verification before a database change is proposed.
