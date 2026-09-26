-- PHASE2C1162 — Finalize auto-allocated Needs Review intents as durable Receiving rows arrive.
create or replace function public.finalize_pharmflow_needs_review_allocations_on_receipt_v1()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_intent_id uuid;
begin
  for v_intent_id in
    select i.id from public.pharmflow_needs_review_resolution_intents_v1 i
    where i.pharmacy_id=new.pharmacy_id and i.status='PENDING' and jsonb_typeof(i.allocations)='array'
      and i.allocations @> jsonb_build_array(jsonb_build_object('transactionId',new.transaction_id))
  loop
    perform public.try_finalize_pharmflow_needs_review_resolution_intent_v2(v_intent_id);
  end loop;
  return new;
end $function$;

drop trigger if exists trg_finalize_pharmflow_needs_review_allocations_v1 on public.pharmflow_receiving_transactions_v1;
create trigger trg_finalize_pharmflow_needs_review_allocations_v1
after insert on public.pharmflow_receiving_transactions_v1
for each row execute function public.finalize_pharmflow_needs_review_allocations_on_receipt_v1();

revoke all on function public.finalize_pharmflow_needs_review_allocations_on_receipt_v1() from public, anon, authenticated;
