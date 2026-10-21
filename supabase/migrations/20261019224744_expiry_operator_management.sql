-- Extends the existing pharmacy operator table; no identity or historical row replacement.
create unique index if not exists expiry_worker_name_key_v1 on public.pharmflow_expiry_workers_v1(pharmacy_id,lower(btrim(worker_name)));
create table if not exists pharmflow_expiry_private.operator_audit_v1(
 id uuid primary key default gen_random_uuid(), pharmacy_id uuid not null,worker_id uuid not null,
 actor uuid not null,action text not null,previous_name text,name text not null,occurred_at timestamptz not null default now());
alter table pharmflow_expiry_private.operator_audit_v1 enable row level security;
revoke all on pharmflow_expiry_private.operator_audit_v1 from public,anon,authenticated;
create or replace function public.save_pharmacy_expiry_worker(p_pharmacy_id uuid,p_worker_name text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare w public.pharmflow_expiry_workers_v1%rowtype;n text:=btrim(p_worker_name);
begin
 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy administrator required';end if;
 if n is null or length(n)<2 or length(n)>60 or n~'[[:cntrl:]]' then raise exception 'Enter an Operator name of 2 to 60 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 select * into w from public.pharmflow_expiry_workers_v1 where pharmacy_id=p_pharmacy_id and lower(btrim(worker_name))=lower(n);
 if found then if not w.active then raise exception 'Operator name already exists (inactive)';end if;return to_jsonb(w);end if;
 insert into public.pharmflow_expiry_workers_v1(pharmacy_id,worker_name,active,created_by) values(p_pharmacy_id,n,true,auth.uid()) returning * into w;
 insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,name) values(p_pharmacy_id,w.id,auth.uid(),'ADD',n);
 return to_jsonb(w);
end $$;
create or replace function public.rename_pharmacy_expiry_worker(p_pharmacy_id uuid,p_worker_id uuid,p_worker_name text,p_expected_name text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare w public.pharmflow_expiry_workers_v1%rowtype;n text:=btrim(p_worker_name);old_name text;
begin
 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy administrator required';end if;
 if n is null or length(n)<2 or length(n)>60 or n~'[[:cntrl:]]' then raise exception 'Enter an Operator name of 2 to 60 characters';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 select * into w from public.pharmflow_expiry_workers_v1 where id=p_worker_id and pharmacy_id=p_pharmacy_id for update;
 if not found or not w.active then raise exception 'Active pharmacy Operator required';end if;
 if w.worker_name=n then return to_jsonb(w);end if;
 if w.worker_name is distinct from p_expected_name then raise exception 'Operator changed; reload Settings';end if;
 if exists(select 1 from public.pharmflow_expiry_workers_v1 where pharmacy_id=p_pharmacy_id and id<>p_worker_id and lower(btrim(worker_name))=lower(n)) then raise exception 'Operator name already exists';end if;
 old_name:=w.worker_name;
 update public.pharmflow_expiry_workers_v1 set worker_name=n,updated_at=now() where id=w.id returning * into w;
 insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,previous_name,name) values(p_pharmacy_id,w.id,auth.uid(),'RENAME',old_name,n);
 return to_jsonb(w);
end $$;
create or replace function public.deactivate_pharmacy_expiry_worker(p_pharmacy_id uuid,p_worker_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare w public.pharmflow_expiry_workers_v1%rowtype;
begin
 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy administrator required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-operators/'||p_pharmacy_id::text,0));
 select * into w from public.pharmflow_expiry_workers_v1 where id=p_worker_id and pharmacy_id=p_pharmacy_id for update;
 if not found then raise exception 'Pharmacy Operator unavailable';end if;
 if not w.active then return to_jsonb(w);end if;
 update public.pharmflow_expiry_workers_v1 set active=false,updated_at=now() where id=w.id returning * into w;
 insert into pharmflow_expiry_private.operator_audit_v1(pharmacy_id,worker_id,actor,action,name) values(p_pharmacy_id,w.id,auth.uid(),'DEACTIVATE',w.worker_name);
 return to_jsonb(w);
end $$;
revoke all on function public.save_pharmacy_expiry_worker(uuid,text),public.rename_pharmacy_expiry_worker(uuid,uuid,text,text),public.deactivate_pharmacy_expiry_worker(uuid,uuid) from public,anon;
grant execute on function public.save_pharmacy_expiry_worker(uuid,text),public.rename_pharmacy_expiry_worker(uuid,uuid,text,text),public.deactivate_pharmacy_expiry_worker(uuid,uuid) to authenticated;
CREATE OR REPLACE FUNCTION public.save_pharmflow_expiry_capture_v3(p_pharmacy_id uuid, p_operation_id uuid, p_capture jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
 v_op pharmflow_expiry_private.operations%rowtype;v_kind text;v_identifier text;v_facts jsonb;v_month integer;v_year integer;v_qty integer;v_worker uuid;v_worker_name text;
 v_product text;v_expiry text;v_ack record;v_review uuid;v_result jsonb;v_date date;v_key text;
begin
 perform pharmflow_expiry_private.valid_auth_session();
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_operation_id is null or jsonb_typeof(p_capture) is distinct from 'object' then raise exception 'Operation and capture required';end if;
 perform public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id,p_operation_id);
 select * into v_op from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id for update;
 if v_op.status='COMMITTED' then
  if v_op.payload is distinct from p_capture then raise exception 'Operation payload conflict';end if;return v_op.result;
 end if;
 if nullif(p_capture->>'worker_id','') is null then raise exception 'Select an active Operator before saving';end if;
 if not (p_capture ?& array['kind','identifier_display','raw_scan','scan_format','quantity','expiry_month','expiry_year','worker_id','device_id','source','batch_no','sample_serial']) then raise exception 'Complete capture fields required';end if;
 if jsonb_typeof(p_capture->'raw_scan') is distinct from 'string' or jsonb_typeof(p_capture->'identifier_display') is distinct from 'string' or jsonb_typeof(p_capture->'device_id') is distinct from 'string' or btrim(p_capture->>'device_id')='' then raise exception 'Exact scan, identifier and device required';end if;
 v_facts:=pharmflow_expiry_private.scan_facts(p_capture->>'raw_scan',p_capture->>'scan_format');v_identifier:=p_capture->>'identifier_display';
 if v_identifier='' or v_identifier is distinct from v_facts->>'identifier' then raise exception 'Identifier does not match raw scan';end if;
 if jsonb_typeof(p_capture->'quantity') is distinct from 'number' or (p_capture->>'quantity') !~ '^[1-9][0-9]*$' or jsonb_typeof(p_capture->'expiry_month') is distinct from 'number' or jsonb_typeof(p_capture->'expiry_year') is distinct from 'number' then raise exception 'Integer quantity and expiry required';end if;
 v_qty:=(p_capture->>'quantity')::integer;v_month:=(p_capture->>'expiry_month')::integer;v_year:=(p_capture->>'expiry_year')::integer;
 if v_month not between 1 and 12 or v_year not between 2020 and 2200 then raise exception 'Invalid expiry';end if;
 if jsonb_typeof(p_capture->'batch_no') not in ('string','null') or jsonb_typeof(p_capture->'sample_serial') not in ('string','null') then raise exception 'Invalid optional batch or serial';end if;
 if not (v_facts ? '10') and pharmflow_expiry_private.batch_is_scanner_payload(p_capture->>'batch_no') then raise exception 'Use Scan Barcode, not Batch';end if;
 if v_facts ? '10' and coalesce(p_capture->>'batch_no','')<>v_facts->>'10' then raise exception 'GS1 batch mismatch';end if;
 if v_facts ? '21' and coalesce(p_capture->>'sample_serial','')<>v_facts->>'21' then raise exception 'GS1 serial mismatch';end if;
 if v_facts ? '17' then
  if (substr(v_facts->>'17',3,2))::integer<>v_month or 2000+(left(v_facts->>'17',2))::integer<>v_year then raise exception 'GS1 expiry mismatch';end if;
  if right(v_facts->>'17',2)<>'00' then v_date:=make_date(v_year,v_month,(right(v_facts->>'17',2))::integer);end if;
 end if;
 if p_capture ? 'identification_note' and (jsonb_typeof(p_capture->'identification_note') not in ('string','null') or length(p_capture->>'identification_note')>250) then raise exception 'Invalid identification note';end if;
 v_kind:=p_capture->>'kind';if v_kind is null or v_kind not in ('KNOWN','UNKNOWN') or p_capture->>'source' is null or p_capture->>'source' not in ('HANDHELD','PC') then raise exception 'Invalid capture kind or source';end if;
 v_worker:=(p_capture->>'worker_id')::uuid;
 if v_worker is not null then
  select worker_name into v_worker_name from public.pharmflow_expiry_workers_v1 where pharmacy_id=p_pharmacy_id and id=v_worker and active=true;
  if v_worker_name is null then raise exception 'Active pharmacy worker required';end if;
 elsif p_capture->>'source'='HANDHELD' or v_kind='UNKNOWN' then raise exception 'Worker required';else v_worker_name:='Desktop';end if;
 update pharmflow_expiry_private.operations set status='COMMITTING',payload=p_capture where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;
 if v_kind='KNOWN' then
  if exists(select 1 from pharmflow_expiry_private.photos where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and deleted_at is null) then raise exception 'Known captures cannot orphan review photos';end if;
  if jsonb_typeof(p_capture->'item_code') is distinct from 'string' or jsonb_typeof(p_capture->'item_name') is distinct from 'string' or btrim(p_capture->>'item_code')='' or btrim(p_capture->>'item_name')='' then raise exception 'Known item fields required';end if;
  v_key:=p_pharmacy_id::text||'/item/'||btrim(p_capture->>'item_code')||'/'||upper(btrim(coalesce(p_capture->>'batch_no','')))||'/'||v_year::text||'/'||v_month::text;
  perform pg_advisory_xact_lock(hashtextextended(v_key,0));
  select * into v_ack from pharmflow_expiry_private.save_known_core(p_pharmacy_id,p_capture->>'item_code',p_capture->>'item_name',v_identifier,p_capture->>'category',v_qty,v_month,v_year,v_worker,p_capture->>'batch_no',p_capture->>'sample_serial',p_capture->>'device_id',p_capture->>'source','CAPTURE');
  if v_ack.state_id is null or v_ack.event_id is null then raise exception 'Save acknowledgement required';end if;
  v_result:=jsonb_build_object('operation_id',p_operation_id,'state_id',v_ack.state_id,'event_id',v_ack.event_id);
 else
  v_product:=coalesce(p_capture->>'product_photo_path',p_capture->>'evidence_photo_path');v_expiry:=p_capture->>'expiry_photo_path';
  if (v_product is null and v_expiry is not null) or (v_expiry is not null and v_product=v_expiry) then raise exception 'One evidence photo is required; legacy two-photo submissions remain supported';end if;
  -- The upload path remains in the existing private immutable Storage namespace.
  -- New submissions use the approved product-role slot for their single evidence image.
  if (v_product is not null and not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o on o.name=p.path and o.bucket_id='pharmflow-needs-review' where p.path=v_product and p.pharmacy_id=p_pharmacy_id and p.operation_id=p_operation_id and p.role='product' and p.created_by=auth.uid() and p.deleted_at is null))
   or (v_expiry is not null and not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o on o.name=p.path and o.bucket_id='pharmflow-needs-review' where p.path=v_expiry and p.pharmacy_id=p_pharmacy_id and p.operation_id=p_operation_id and p.role='expiry' and p.created_by=auth.uid() and p.deleted_at is null)) then raise exception 'Uploaded role-correct evidence photo required';end if;
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,gtin,identifier_display,identifier_key,raw_barcode,pending_quantity,review_reason,source,device_id,created_by,operation_id)
  values(p_pharmacy_id,'EXPIRY',v_identifier,v_identifier,public.pharmflow_identifier_key_v2(v_identifier),p_capture->>'raw_scan',v_qty,'UNKNOWN_GTIN',p_capture->>'source',p_capture->>'device_id',auth.uid(),p_operation_id::text) returning id into v_review;
  insert into pharmflow_expiry_private.review_details(review_id,pharmacy_id,operation_id,worker_name,product_photo_path,expiry_photo_path)
  values(v_review,p_pharmacy_id,p_operation_id,v_worker_name,v_product,v_expiry);
  v_result:=jsonb_build_object('operation_id',p_operation_id,'review_id',v_review,'quantity',v_qty,'product_photo_path',v_product,'expiry_photo_path',v_expiry,'evidence_photo_path',v_product);
 end if;
 update pharmflow_expiry_private.operations set status='COMMITTED',result=v_result where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;return v_result;
end $function$

;

