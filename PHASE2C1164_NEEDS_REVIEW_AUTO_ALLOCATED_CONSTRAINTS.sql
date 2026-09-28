-- PHASE2C1164 — Needs Review AUTO_ALLOCATED constraint compatibility
-- Backward-compatible: preserves all existing resolution types and adds the
-- value already written by request/finalizer v5/v2.

begin;

alter table public.pharmflow_needs_review_resolution_intents_v1
  drop constraint if exists pharmflow_nr_resolution_intents_required_values;

alter table public.pharmflow_needs_review_resolution_intents_v1
  add constraint pharmflow_nr_resolution_intents_required_values
  check (
    btrim(transaction_id) <> ''
    and btrim(item_code) <> ''
    and resolution_type in ('LINK_ORDER_ITEM','AUTO_ALLOCATED')
  );

alter table public.pharmflow_needs_review_v2
  drop constraint if exists pharmflow_needs_review_v2_resolution_check;

alter table public.pharmflow_needs_review_v2
  add constraint pharmflow_needs_review_v2_resolution_check
  check (
    resolution_type is null
    or resolution_type in ('LINK_ORDER_ITEM','ADD_UNORDERED','AUTO_ALLOCATED')
  );

commit;
