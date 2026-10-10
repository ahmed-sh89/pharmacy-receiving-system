-- EXPIRY NEEDS REVIEW V1 — Staging-only additive correction.
-- PREPARED ONLY. DO NOT APPLY without separate Product Owner approval.
-- Target ref MUST be verified immediately before application as tovkcakucyagvbzvlnks.
-- PostgreSQL does not expose a trustworthy Supabase project ref; the migration runner must bind that exact project_id.
-- Existing Receiving RPCs, policies, rows, and photos are not changed.
-- Existing 2-photo Expiry rows remain valid; new capture writes one evidence photo.

begin;

do $$
begin
 if current_database()<>'postgres' then raise exception 'Unexpected database';end if;
 if to_regclass('public.pharmflow_needs_review_v2') is null or to_regclass('pharmflow_expiry_private.review_details') is null or to_regclass('pharmflow_expiry_private.photos') is null or to_regclass('pharmflow_expiry_private.operations') is null then raise exception 'Expected Expiry review foundation missing';end if;
 if to_regclass('public.pharmflow_global_items_v2') is null or to_regclass('public.pharmflow_global_item_identifiers_v2') is null or to_regclass('public.pharmflow_identifier_mapping_audit_v1') is null then raise exception 'Approved PHASE2C1152 Global Master and audit dependencies missing';end if;
 if not exists(select 1 from storage.buckets where id='pharmflow-needs-review' and public is false) then raise exception 'Private review bucket required';end if;
 if not exists(select 1 from pg_attribute where attrelid='pharmflow_expiry_private.review_details'::regclass and attname='expiry_photo_path' and atttypid='text'::regtype and attnotnull) then raise exception 'Unexpected review_details.expiry_photo_path definition';end if;
 if not exists(select 1 from pg_attribute where attrelid='pharmflow_expiry_private.review_details'::regclass and attname='product_photo_path' and atttypid='text'::regtype and attnotnull) then raise exception 'Unexpected review_details.product_photo_path definition';end if;
 -- Compare constraint structure and columns, not PostgreSQL's formatted SQL text.
 if not exists(select 1 from pg_constraint c where c.conrelid='pharmflow_expiry_private.review_details'::regclass and c.contype='f' and c.confrelid='pharmflow_expiry_private.photos'::regclass and c.convalidated and c.confdeltype='a'
   and (select array_agg(a.attname::text order by x.ord) from unnest(c.conkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=x.attnum)=array['expiry_photo_path']
   and (select array_agg(a.attname::text order by x.ord) from unnest(c.confkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=x.attnum)=array['path']) then raise exception 'Historical expiry photo foreign key must reference photos.path without cascading deletes';end if;
 if not exists(select 1 from pg_constraint c where c.conrelid='pharmflow_expiry_private.review_details'::regclass and c.contype='f' and c.confrelid='pharmflow_expiry_private.photos'::regclass and c.convalidated and c.confdeltype='a'
   and (select array_agg(a.attname::text order by x.ord) from unnest(c.conkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=x.attnum)=array['product_photo_path']
   and (select array_agg(a.attname::text order by x.ord) from unnest(c.confkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=x.attnum)=array['path']) then raise exception 'Evidence photo foreign key must reference photos.path without cascading deletes';end if;
 if not exists(select 1 from pg_constraint c where c.conrelid='pharmflow_expiry_private.review_details'::regclass and c.contype='f' and c.confrelid='pharmflow_expiry_private.operations'::regclass and c.convalidated and c.confdeltype='a'
   and (select array_agg(a.attname::text order by x.ord) from unnest(c.conkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=x.attnum)=array['pharmacy_id','operation_id']
   and (select array_agg(a.attname::text order by x.ord) from unnest(c.confkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=x.attnum)=array['pharmacy_id','operation_id']) then raise exception 'Review operation foreign key must retain pharmacy scope';end if;
 if not exists(select 1 from pg_constraint c where c.conrelid='pharmflow_expiry_private.review_details'::regclass and c.contype='f' and c.confrelid='public.pharmflow_needs_review_v2'::regclass and c.convalidated and c.confdeltype='a'
   and (select array_agg(a.attname::text order by x.ord) from unnest(c.conkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=x.attnum)=array['review_id']
   and (select array_agg(a.attname::text order by x.ord) from unnest(c.confkey) with ordinality x(attnum,ord) join pg_attribute a on a.attrelid=c.confrelid and a.attnum=x.attnum)=array['id']) then raise exception 'Review detail foreign key must reference its review case';end if;
 if not exists(select 1 from pg_constraint c where c.conrelid='pharmflow_expiry_private.review_details'::regclass and c.contype='c' and c.convalidated
   and (select array_agg(a.attname::text order by a.attname) from unnest(c.conkey) x(attnum) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=x.attnum)=array['expiry_photo_path','product_photo_path']
   and regexp_replace(lower(pg_get_expr(c.conbin,c.conrelid)),'[[:space:]()"]','','g')='product_photo_path<>expiry_photo_path') then raise exception 'Historical distinct-photo constraint missing or invalid';end if;
 if not exists(select 1 from pg_constraint c where c.conrelid='public.pharmflow_global_items_v2'::regclass and c.contype='p' and c.convalidated and c.conkey=array[(select attnum::smallint from pg_attribute where attrelid=c.conrelid and attname='item_code')]) or not exists(select 1 from pg_constraint c where c.conrelid='public.pharmflow_global_item_identifiers_v2'::regclass and c.contype='p' and c.convalidated and c.conkey=array[(select attnum::smallint from pg_attribute where attrelid=c.conrelid and attname='id')]) then raise exception 'Approved Global Master V2 primary key columns differ';end if;
 if not exists(select 1 from pg_constraint c where c.conrelid='public.pharmflow_global_item_identifiers_v2'::regclass and c.contype='f' and c.confrelid='public.pharmflow_global_items_v2'::regclass and c.convalidated and c.confdeltype='r'
   and c.conkey=array[(select attnum::smallint from pg_attribute where attrelid=c.conrelid and attname='item_code')]
   and c.confkey=array[(select attnum::smallint from pg_attribute where attrelid=c.confrelid and attname='item_code')]) or not exists(select 1 from pg_constraint c where c.conrelid='public.pharmflow_global_item_identifiers_v2'::regclass and c.contype='u' and c.convalidated and c.conkey=array[(select attnum::smallint from pg_attribute where attrelid=c.conrelid and attname='identifier_key')]) then raise exception 'Approved identifier FK or unique key differs';end if;
 if not exists(select 1 from pg_constraint c where c.conrelid='public.pharmflow_identifier_mapping_audit_v1'::regclass and c.contype='u' and c.convalidated and c.conkey=array[(select attnum::smallint from pg_attribute where attrelid=c.conrelid and attname='operation_id')]) then raise exception 'Approved mapping audit idempotency constraint missing';end if;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='save_pharmflow_expiry_capture_v3')<>1 or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_pharmflow_expiry_review_v1')<>1 then raise exception 'Unexpected Expiry capture/read RPC overloads';end if;
 if not (select relrowsecurity from pg_class where oid='pharmflow_expiry_private.photos'::regclass) or not (select relrowsecurity from pg_class where oid='pharmflow_expiry_private.review_details'::regclass) or not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then raise exception 'Expected private review/photo RLS is disabled';end if;
 if not exists(select 1 from pg_policy p where p.polrelid='public.pharmflow_needs_review_v2'::regclass and p.polcmd='r' and p.polroles=array[(select oid from pg_roles where rolname='authenticated')] and position('is_pharmacy_member' in lower(pg_get_expr(p.polqual,p.polrelid)))>0) then raise exception 'Review read policy must remain authenticated and pharmacy-member scoped';end if;
 if not exists(select 1 from pg_policy p where p.polrelid='storage.objects'::regclass and p.polname='pf_nr_photo_select' and p.polcmd='r' and p.polroles=array[(select oid from pg_roles where rolname='authenticated')] and position('pharmflow-needs-review' in pg_get_expr(p.polqual,p.polrelid))>0 and position('is_pharmacy_member' in lower(pg_get_expr(p.polqual,p.polrelid)))>0 and position('foldername' in lower(pg_get_expr(p.polqual,p.polrelid)))>0) then raise exception 'Private photo reads must remain authenticated, bucket-specific, and pharmacy-member scoped';end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='pf_nr_photo_insert' and polcmd='a') or not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='pf_nr_photo_update' and polcmd='w') or not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='pf_nr_photo_delete' and polcmd='d') or not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='pharmflow_expiry_staged_photo_delete' and polcmd='d') then raise exception 'Existing private Storage write/cleanup policies differ; stop and re-audit';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('list_pharmflow_expiry_reviews_v1','count_pharmflow_expiry_reviews_v1','resolve_pharmflow_expiry_review_v1','get_pharmflow_expiry_review_contract_v1')) then raise exception 'Conflicting Expiry review RPC exists; stop and compare signatures';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='add_pharmflow_global_identifier_v2') then raise exception 'Global Master add RPC name is already occupied; compare PHASE2C1159 and do not create an overload';end if;
 if to_regprocedure('public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb)') is null or to_regprocedure('public.get_pharmflow_expiry_review_v1(uuid,uuid)') is null then raise exception 'Existing operation-aware Expiry write/read contract missing';end if;
 if to_regprocedure('public.pharmflow_is_reference_master_admin_v1()') is null or to_regprocedure('public.pharmflow_identifier_key_v2(text)') is null or to_regprocedure('public.is_pharmacy_member(uuid)') is null or to_regprocedure('public.is_pharmacy_admin(uuid)') is null then raise exception 'Approved authorization or normalization dependencies missing';end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.pharmflow_needs_review_v2'::regclass and tgname='pharmflow_expiry_review_guard' and not tgisinternal) then raise exception 'Expiry review guard trigger missing';end if;
 if not exists(select 1 from pg_trigger where tgrelid='storage.objects'::regclass and tgname='pharmflow_expiry_photo_guard' and not tgisinternal) then raise exception 'Private Expiry photo guard missing';end if;
 if exists(select 1 from public.pharmflow_needs_review_v2 r left join pharmflow_expiry_private.review_details d on d.review_id=r.id and d.pharmacy_id=r.pharmacy_id where r.workflow='EXPIRY' and (d.review_id is null or d.product_photo_path is null or not exists(select 1 from pharmflow_expiry_private.photos p where p.path=d.product_photo_path and p.pharmacy_id=r.pharmacy_id) or (d.expiry_photo_path is not null and (d.expiry_photo_path=d.product_photo_path or not exists(select 1 from pharmflow_expiry_private.photos p where p.path=d.expiry_photo_path and p.pharmacy_id=r.pharmacy_id))))) then raise exception 'Existing Expiry review/photo references are incomplete or cross-pharmacy';end if;
end $$;

-- One-photo rows retain the first existing path/role; old rows still carry both.
alter table pharmflow_expiry_private.review_details alter column expiry_photo_path drop not null;

create or replace function public.save_pharmflow_expiry_capture_v3(p_pharmacy_id uuid,p_operation_id uuid,p_capture jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare
 v_op pharmflow_expiry_private.operations%rowtype;v_kind text;v_identifier text;v_facts jsonb;v_month integer;v_year integer;v_qty integer;v_worker uuid;v_worker_name text;
 v_product text;v_expiry text;v_ack record;v_review uuid;v_result jsonb;v_date date;v_key text;
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_operation_id is null or jsonb_typeof(p_capture) is distinct from 'object' then raise exception 'Operation and capture required';end if;
 perform public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id,p_operation_id);
 select * into v_op from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id for update;
 if v_op.status='COMMITTED' then
  if v_op.payload is distinct from p_capture then raise exception 'Operation payload conflict';end if;return v_op.result;
 end if;
 if not (p_capture ?& array['kind','identifier_display','raw_scan','scan_format','quantity','expiry_month','expiry_year','worker_id','device_id','source','batch_no','sample_serial']) then raise exception 'Complete capture fields required';end if;
 if jsonb_typeof(p_capture->'raw_scan') is distinct from 'string' or jsonb_typeof(p_capture->'identifier_display') is distinct from 'string' or jsonb_typeof(p_capture->'device_id') is distinct from 'string' or btrim(p_capture->>'device_id')='' then raise exception 'Exact scan, identifier and device required';end if;
 v_facts:=pharmflow_expiry_private.scan_facts(p_capture->>'raw_scan',p_capture->>'scan_format');v_identifier:=p_capture->>'identifier_display';
 if v_identifier='' or v_identifier is distinct from v_facts->>'identifier' then raise exception 'Identifier does not match raw scan';end if;
 if jsonb_typeof(p_capture->'quantity') is distinct from 'number' or (p_capture->>'quantity') !~ '^[1-9][0-9]*$' or jsonb_typeof(p_capture->'expiry_month') is distinct from 'number' or jsonb_typeof(p_capture->'expiry_year') is distinct from 'number' then raise exception 'Integer quantity and expiry required';end if;
 v_qty:=(p_capture->>'quantity')::integer;v_month:=(p_capture->>'expiry_month')::integer;v_year:=(p_capture->>'expiry_year')::integer;
 if v_month not between 1 and 12 or v_year not between 2020 and 2200 then raise exception 'Invalid expiry';end if;
 if jsonb_typeof(p_capture->'batch_no') not in ('string','null') or jsonb_typeof(p_capture->'sample_serial') not in ('string','null') then raise exception 'Invalid optional batch or serial';end if;
 if v_facts ? '10' and coalesce(p_capture->>'batch_no','')<>v_facts->>'10' then raise exception 'GS1 batch mismatch';end if;
 if v_facts ? '21' and coalesce(p_capture->>'sample_serial','')<>v_facts->>'21' then raise exception 'GS1 serial mismatch';end if;
 if v_facts ? '17' then
  if (substr(v_facts->>'17',3,2))::integer<>v_month or 2000+(left(v_facts->>'17',2))::integer<>v_year then raise exception 'GS1 expiry mismatch';end if;
  if right(v_facts->>'17',2)<>'00' then v_date:=make_date(v_year,v_month,(right(v_facts->>'17',2))::integer);end if;
 end if;
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
  if v_product is null or (v_expiry is not null and v_product=v_expiry) then raise exception 'One evidence photo is required; legacy two-photo submissions remain supported';end if;
  -- The upload path remains in the existing private immutable Storage namespace.
  -- New submissions use the approved product-role slot for their single evidence image.
  if not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o on o.name=p.path and o.bucket_id='pharmflow-needs-review' where p.path=v_product and p.pharmacy_id=p_pharmacy_id and p.operation_id=p_operation_id and p.role='product' and p.created_by=auth.uid() and p.deleted_at is null)
   or (v_expiry is not null and not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o on o.name=p.path and o.bucket_id='pharmflow-needs-review' where p.path=v_expiry and p.pharmacy_id=p_pharmacy_id and p.operation_id=p_operation_id and p.role='expiry' and p.created_by=auth.uid() and p.deleted_at is null)) then raise exception 'Uploaded role-correct evidence photo required';end if;
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,gtin,identifier_display,identifier_key,raw_barcode,pending_quantity,review_reason,source,device_id,created_by,operation_id)
  values(p_pharmacy_id,'EXPIRY',v_identifier,v_identifier,public.pharmflow_identifier_key_v2(v_identifier),p_capture->>'raw_scan',v_qty,'UNKNOWN_GTIN',p_capture->>'source',p_capture->>'device_id',auth.uid(),p_operation_id::text) returning id into v_review;
  insert into pharmflow_expiry_private.review_details(review_id,pharmacy_id,operation_id,worker_name,product_photo_path,expiry_photo_path)
  values(v_review,p_pharmacy_id,p_operation_id,v_worker_name,v_product,v_expiry);
  v_result:=jsonb_build_object('operation_id',p_operation_id,'review_id',v_review,'quantity',v_qty,'product_photo_path',v_product,'expiry_photo_path',v_expiry,'evidence_photo_path',v_product);
 end if;
 update pharmflow_expiry_private.operations set status='COMMITTED',result=v_result where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;return v_result;
end $$;

create or replace function public.add_pharmflow_global_identifier_v2(
  p_operation_id uuid, p_identifier_display text, p_item_code text, p_reason text
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_display text:=btrim(coalesce(p_identifier_display,''));
 v_key text:=public.pharmflow_identifier_key_v2(p_identifier_display);
 v_item_code text:=btrim(coalesce(p_item_code,''));
 v_reason text:=btrim(coalesce(p_reason,''));
 v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;
 v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;
begin
 if auth.uid() is null or not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required'; end if;
 if p_operation_id is null or v_key='' or v_item_code='' or v_reason='' then raise exception 'Operation, identifier, item and reason are required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
 select * into v_mapping from public.pharmflow_global_item_identifiers_v2 where identifier_key=v_key for update;
 if v_mapping.id is not null and v_mapping.item_code<>v_item_code then raise exception 'Identifier is already mapped to another Item Code'; end if;
 if not exists(select 1 from public.pharmflow_global_items_v2 where item_code=v_item_code) then raise exception 'Global Item Code does not exist'; end if;
 if v_mapping.id is null then
   insert into public.pharmflow_global_item_identifiers_v2(item_code,identifier_display,identifier_key,created_by,updated_by)
   values(v_item_code,v_display,v_key,auth.uid(),auth.uid()) returning * into v_mapping;
 end if;
 insert into public.pharmflow_identifier_mapping_audit_v1(operation_id,action,identifier_id,identifier_display,identifier_key,old_item_code,new_item_code,reason,performed_by)
 values(p_operation_id,'ADD',v_mapping.id,v_mapping.identifier_display,v_mapping.identifier_key,null,v_mapping.item_code,v_reason,auth.uid())
 on conflict(operation_id) do nothing;
 -- PHASE2C1159's signature, authorization, normalized key, mapping write and
 -- audit schema stay canonical. This guard closes its DO NOTHING false-success
 -- case and still permits an exact same-operation retry only.
 select * into v_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id for update;
 if not found or v_audit.action is distinct from 'ADD' or v_audit.identifier_id is distinct from v_mapping.id
    or v_audit.identifier_display is distinct from v_mapping.identifier_display or v_audit.identifier_key is distinct from v_mapping.identifier_key
    or v_audit.old_item_code is not null or v_audit.new_item_code is distinct from v_mapping.item_code
    or v_audit.reason is distinct from v_reason or v_audit.performed_by is distinct from auth.uid() then
   raise exception 'Operation ID was already used for a different identifier mapping operation';
 end if;
 return jsonb_build_object('success',true,'identifierId',v_mapping.id,'mappingRevision',v_mapping.mapping_revision,'itemCode',v_mapping.item_code);
end $$;


create or replace function public.get_pharmflow_expiry_review_v1(p_pharmacy_id uuid,p_review_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_result jsonb;
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select o.payload||jsonb_build_object('review_id',r.id,'pharmacy_id',r.pharmacy_id,'identifier_key',r.identifier_key,'status',r.status,'created_by',r.created_by,'created_at',r.created_at,'review_reason',r.review_reason,'resolved_by',r.resolved_by,'resolved_item_code',r.resolved_item_code,'resolved_item_name',r.resolved_item_name,'resolved_at',r.resolved_at,'resolution_transaction_id',r.resolution_transaction_id,'worker_name',d.worker_name,'product_photo_path',d.product_photo_path,'expiry_photo_path',d.expiry_photo_path,'evidence_photo_path',coalesce(d.product_photo_path,d.expiry_photo_path),'product_photo_deleted',p.deleted_at is not null,'expiry_photo_deleted',e.deleted_at is not null,'evidence_photo_deleted',coalesce(p.deleted_at,e.deleted_at) is not null)
 into v_result from public.pharmflow_needs_review_v2 r join pharmflow_expiry_private.review_details d on d.review_id=r.id and d.pharmacy_id=r.pharmacy_id join pharmflow_expiry_private.operations o on o.pharmacy_id=d.pharmacy_id and o.operation_id=d.operation_id join pharmflow_expiry_private.photos p on p.path=d.product_photo_path left join pharmflow_expiry_private.photos e on e.path=d.expiry_photo_path where r.id=p_review_id and r.pharmacy_id=p_pharmacy_id and r.workflow='EXPIRY';return v_result;
end $$;
create or replace function public.list_pharmflow_expiry_reviews_v1(p_pharmacy_id uuid,p_status text default 'PENDING',p_limit integer default 250,p_offset integer default 0)
returns setof jsonb language plpgsql security definer set search_path=pg_catalog,public,pharmflow_expiry_private,pg_temp as $$
declare v_status text:=upper(btrim(coalesce(p_status,'PENDING')));v_limit integer:=least(greatest(coalesce(p_limit,250),1),500);v_offset integer:=greatest(coalesce(p_offset,0),0);
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if v_status not in ('PENDING','RESOLVED','ALL') then raise exception 'Invalid Expiry review status';end if;
 return query select o.payload||jsonb_build_object('review_id',r.id,'pharmacy_id',r.pharmacy_id,'identifier_key',r.identifier_key,'status',r.status,'created_by',r.created_by,'created_at',r.created_at,'review_reason',r.review_reason,'resolved_by',r.resolved_by,'resolved_item_code',r.resolved_item_code,'resolved_item_name',r.resolved_item_name,'resolved_at',r.resolved_at,'resolution_transaction_id',r.resolution_transaction_id,'worker_name',d.worker_name,'product_photo_path',d.product_photo_path,'expiry_photo_path',d.expiry_photo_path,'evidence_photo_path',coalesce(d.product_photo_path,d.expiry_photo_path),'evidence_photo_deleted',coalesce(p.deleted_at,e.deleted_at) is not null)
 from public.pharmflow_needs_review_v2 r join pharmflow_expiry_private.review_details d on d.review_id=r.id and d.pharmacy_id=r.pharmacy_id join pharmflow_expiry_private.operations o on o.pharmacy_id=d.pharmacy_id and o.operation_id=d.operation_id left join pharmflow_expiry_private.photos p on p.path=d.product_photo_path left join pharmflow_expiry_private.photos e on e.path=d.expiry_photo_path
 where r.pharmacy_id=p_pharmacy_id and r.workflow='EXPIRY' and (v_status='ALL' or r.status=v_status)
 order by r.created_at desc,r.id desc limit v_limit offset v_offset;
end $$;
create or replace function public.count_pharmflow_expiry_reviews_v1(p_pharmacy_id uuid)
returns bigint language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_count bigint;
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select count(*) into v_count from public.pharmflow_needs_review_v2 where pharmacy_id=p_pharmacy_id and workflow='EXPIRY' and status='PENDING';return v_count;
end $$;
create or replace function public.get_pharmflow_expiry_review_contract_v1(p_pharmacy_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if to_regprocedure('public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb)') is null or to_regprocedure('public.get_pharmflow_expiry_review_v1(uuid,uuid)') is null or to_regprocedure('public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer)') is null or to_regprocedure('public.count_pharmflow_expiry_reviews_v1(uuid)') is null or to_regprocedure('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)') is null or to_regprocedure('public.add_pharmflow_global_identifier_v2(uuid,text,text,text)') is null then raise exception 'Expiry review contract is incomplete';end if;
 return jsonb_build_object('contract_version','EXPIRY_NEEDS_REVIEW_20261010_V1');
end $$;
create or replace function public.resolve_pharmflow_expiry_review_v1(p_pharmacy_id uuid,p_review_id uuid,p_operation_id uuid,p_item_code text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pharmflow_expiry_private,pg_temp as $$
declare v_review public.pharmflow_needs_review_v2%rowtype;v_details pharmflow_expiry_private.review_details%rowtype;v_item public.pharmflow_global_items_v2%rowtype;v_identifier text;v_key text;v_reason text:=btrim(coalesce(p_reason,''));v_existing public.pharmflow_global_item_identifiers_v2%rowtype;v_mapping_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;v_mapping jsonb;
begin
 if auth.uid() is null or p_pharmacy_id is null or not public.is_pharmacy_member(p_pharmacy_id) or not public.is_pharmacy_admin(p_pharmacy_id) then raise exception 'Pharmacy review administrator permission required';end if;
 if p_operation_id is null or p_review_id is null or nullif(btrim(coalesce(p_item_code,'')),'') is null or v_reason='' or length(v_reason)>500 then raise exception 'Operation, case, existing Global Master Item Code and reason are required';end if;
 if not public.pharmflow_is_reference_master_admin_v1() then raise exception 'Global Identifier write permission required';end if;
 select * into v_review from public.pharmflow_needs_review_v2 where id=p_review_id and pharmacy_id=p_pharmacy_id and workflow='EXPIRY' for update;
 if not found then raise exception 'Expiry review case not found';end if;
 if v_review.status='RESOLVED' then
  if v_review.resolution_transaction_id is distinct from p_operation_id::text then raise exception 'Expiry review was already resolved under another operation ID';end if;
  if v_review.resolved_item_code<>btrim(p_item_code) then raise exception 'Expiry review was already resolved to another Item Code';end if;
  return jsonb_build_object('success',true,'review_id',v_review.id,'item_code',v_review.resolved_item_code,'item_name',v_review.resolved_item_name,'operation_id',v_review.resolution_transaction_id,'already_resolved',true);
 end if;
 if v_review.status<>'PENDING' then raise exception 'Expiry review is not pending';end if;
 select * into v_details from pharmflow_expiry_private.review_details where review_id=p_review_id and pharmacy_id=p_pharmacy_id;
 if not found then raise exception 'Expiry review evidence is unavailable';end if;
 v_identifier:=coalesce(nullif(btrim(v_review.identifier_display),''),v_review.gtin);
 v_key:=public.pharmflow_identifier_key_v2(v_identifier);
 select * into v_item from public.pharmflow_global_items_v2 where item_code=btrim(p_item_code);
 if not found then raise exception 'Global Item Code does not exist';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_key,1152));
 select * into v_existing from public.pharmflow_global_item_identifiers_v2 where identifier_key=v_key for update;
 if v_existing.id is not null and v_existing.item_code<>v_item.item_code then raise exception 'Identifier is already mapped to another Item Code';end if;
 select * into v_mapping_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id;
 if v_mapping_audit.id is not null and (v_mapping_audit.action<>'ADD' or v_mapping_audit.identifier_key<>v_key or v_mapping_audit.new_item_code<>v_item.item_code or v_mapping_audit.performed_by<>auth.uid()) then raise exception 'Resolution operation ID was already used for another mapping';end if;
 v_mapping:=public.add_pharmflow_global_identifier_v2(p_operation_id,v_identifier,v_item.item_code,v_reason);
 if coalesce((v_mapping->>'success')::boolean,false) is not true or v_mapping->>'itemCode'<>v_item.item_code then raise exception 'Global Identifier mapping was not acknowledged';end if;
 update public.pharmflow_needs_review_v2 set status='RESOLVED',resolved_by=auth.uid(),resolved_item_code=v_item.item_code,resolved_item_name=v_item.item_name,resolved_at=now(),resolution_transaction_id=p_operation_id::text,updated_at=now() where id=p_review_id and pharmacy_id=p_pharmacy_id and status='PENDING';
 if not found then raise exception 'Expiry review resolution transition was not committed';end if;
 return jsonb_build_object('success',true,'review_id',p_review_id,'item_code',v_item.item_code,'item_name',v_item.item_name,'operation_id',p_operation_id::text,'already_resolved',false);
end $$;

-- Preserve SECURITY DEFINER boundaries and expose only authenticated RPC calls.
revoke all on function public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb),public.get_pharmflow_expiry_review_v1(uuid,uuid),public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer),public.count_pharmflow_expiry_reviews_v1(uuid),public.get_pharmflow_expiry_review_contract_v1(uuid),public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text),public.add_pharmflow_global_identifier_v2(uuid,text,text,text) from public,anon;
grant execute on function public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb),public.get_pharmflow_expiry_review_v1(uuid,uuid),public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer),public.count_pharmflow_expiry_reviews_v1(uuid),public.get_pharmflow_expiry_review_contract_v1(uuid),public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text),public.add_pharmflow_global_identifier_v2(uuid,text,text,text) to authenticated;

-- Verification queries (run after application as a separately approved Staging action):
-- select to_regprocedure('public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb)'),
--        to_regprocedure('public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer)'),
--        to_regprocedure('public.count_pharmflow_expiry_reviews_v1(uuid)'),
--        to_regprocedure('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)'),
--        to_regprocedure('public.add_pharmflow_global_identifier_v2(uuid,text,text,text)');
-- select is_nullable from information_schema.columns where table_schema='pharmflow_expiry_private' and table_name='review_details' and column_name='expiry_photo_path';
-- select count(*) filter(where status='PENDING') pending,count(*) filter(where status='RESOLVED') resolved from public.pharmflow_needs_review_v2 where workflow='EXPIRY';
-- Verify function ACLs via information_schema.routine_privileges; verify bucket remains private and storage policies unchanged.

-- Recovery / rollback:
-- 1. If this transaction fails, PostgreSQL rolls back all DDL and RPC changes.
-- 2. For a post-application issue, first disable the new client contract and
--    restore the previous reviewed V3 save/read definitions from the saved
--    Expiry integrity contract. Do not delete case rows or uploaded evidence.
-- 3. Restore expiry_photo_path NOT NULL only after proving there are zero rows
--    with a null expiry_photo_path. If any one-photo rows exist, preserve the
--    nullable column and recover forward; never synthesize a second photo.
-- 4. Revoke/remove only the new review list/count/resolve/contract RPCs after
--    client rollback. Preserve Global Master audit/mapping records and every
--    existing Expiry or Receiving row. Do not roll back PHASE2C1152/1159.

commit;
