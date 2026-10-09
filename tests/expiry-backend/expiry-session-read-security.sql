-- Staging synthetic read-only integration test. No inserts, save RPCs or deletes.
begin read only;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5647d3d3-b98c-4fe5-a093-c21346f9384d","role":"authenticated"}',true);
do $$
declare r jsonb; denied boolean:=false;
begin
 r:=public.list_pharmflow_expiry_capture_receipts_v1('11111111-1111-4111-8111-111111111111','DEV-a9ccac23-ad37-44a4-bd99-f846f404f862','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',array['f416ecf1-671b-45e1-b6be-1782593ff915'::uuid,'f416ecf1-671b-45e1-b6be-1782593ff915'::uuid]);
 assert jsonb_array_length(r)=1,'Duplicate IDs must not duplicate receipts';
 assert r->0->>'identifier_display'='04065272072977' and (r->0->>'quantity')::int=1;
 assert (r->0->>'expiry_month')::int=10 and (r->0->>'expiry_year')::int=2026;
 assert exists(select 1 from public.list_pharmacy_expiry_current_state_v1('11111111-1111-4111-8111-111111111111',false,'04065272072977') s where state_id='9e65e51b-ee54-4449-9a58-e01245ef20e9' and verified_quantity=1),'Inventory must expose the same state';
 assert public.list_pharmflow_expiry_capture_receipts_v1('11111111-1111-4111-8111-111111111111','another-device','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',array['f416ecf1-671b-45e1-b6be-1782593ff915'::uuid])='[]'::jsonb;
 assert public.list_pharmflow_expiry_capture_receipts_v1('11111111-1111-4111-8111-111111111111','DEV-a9ccac23-ad37-44a4-bd99-f846f404f862','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',array['f416ecf1-671b-45e1-b6be-1782593ff915'::uuid])='[]'::jsonb;
 begin perform public.list_pharmflow_expiry_capture_receipts_v1('22222222-2222-4222-8222-222222222222','DEV-a9ccac23-ad37-44a4-bd99-f846f404f862','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',array['f416ecf1-671b-45e1-b6be-1782593ff915'::uuid]);
 exception when raise_exception then denied:=SQLERRM='Pharmacy access required'; end;
 assert denied,'Cross-pharmacy read must be denied';
 assert public.list_pharmflow_expiry_capture_receipts_v1('11111111-1111-4111-8111-111111111111','DEV-a9ccac23-ad37-44a4-bd99-f846f404f862','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',array[]::uuid[])='[]'::jsonb,'Cleared session IDs must not return inventory history';
end $$;
select set_config('request.jwt.claims','{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',true);
do $$ begin
 assert public.list_pharmflow_expiry_capture_receipts_v1('11111111-1111-4111-8111-111111111111','DEV-a9ccac23-ad37-44a4-bd99-f846f404f862','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',array['f416ecf1-671b-45e1-b6be-1782593ff915'::uuid])='[]'::jsonb,'Another account cannot read the TC26 session';
end $$;
select set_config('request.jwt.claims','{}',true);
do $$ declare denied boolean:=false;begin
 begin perform public.list_pharmflow_expiry_capture_receipts_v1('11111111-1111-4111-8111-111111111111','device','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',array[]::uuid[]);
 exception when raise_exception then denied:=SQLERRM='Pharmacy access required';end;
 assert denied,'Missing auth identity must be denied';
 assert not has_function_privilege('anon','public.list_pharmflow_expiry_capture_receipts_v1(uuid,text,uuid,uuid[])','execute'),'Anonymous execute grant must be absent';
 denied:=false;
 begin perform 1 from pharmflow_expiry_private.operations limit 1;exception when insufficient_privilege then denied:=true;end;
 assert denied,'Private operation table must remain inaccessible';
end $$;
select jsonb_build_object('receipt_and_inventory','PASS','duplicate_receipt_ids','PASS','device_and_operator_scope','PASS','cross_pharmacy_denial','PASS','account_isolation','PASS','anonymous_denial','PASS','clear_scope','PASS','capture_writes',0) as database_test_evidence;
rollback;
