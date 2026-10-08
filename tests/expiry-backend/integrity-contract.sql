-- New private operation/media state. Existing rows and legacy media paths untouched.
create table pharmflow_expiry_private.operations (
 pharmacy_id uuid not null references public.pharmacies(id),operation_id uuid not null,
 created_by uuid not null references auth.users(id),status text not null default 'RESERVED' check(status in ('RESERVED','COMMITTING','COMMITTED')),
 payload jsonb,result jsonb,created_at timestamptz not null default now(),primary key(pharmacy_id,operation_id)
);
create table pharmflow_expiry_private.photos (
 path text primary key,pharmacy_id uuid not null,operation_id uuid not null,role text not null check(role in ('product','expiry')),
 created_by uuid not null,cleanup_by uuid,cleanup_until timestamptz,deleted_at timestamptz,
 foreign key(pharmacy_id,operation_id) references pharmflow_expiry_private.operations(pharmacy_id,operation_id)
);
create table pharmflow_expiry_private.review_details (
 review_id uuid primary key references public.pharmflow_needs_review_v2(id),pharmacy_id uuid not null,operation_id uuid not null,
 worker_name text not null,product_photo_path text not null references pharmflow_expiry_private.photos(path),
 expiry_photo_path text not null references pharmflow_expiry_private.photos(path),
 foreign key(pharmacy_id,operation_id) references pharmflow_expiry_private.operations(pharmacy_id,operation_id),
 check(product_photo_path<>expiry_photo_path)
);
alter table pharmflow_expiry_private.operations enable row level security;
alter table pharmflow_expiry_private.photos enable row level security;
alter table pharmflow_expiry_private.review_details enable row level security;
revoke all on all tables in schema pharmflow_expiry_private from public,anon,authenticated;

create function public.reserve_pharmflow_expiry_capture_v1(p_pharmacy_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_row pharmflow_expiry_private.operations%rowtype;
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_operation_id is null then raise exception 'Operation required';end if;
 insert into pharmflow_expiry_private.operations(pharmacy_id,operation_id,created_by) values(p_pharmacy_id,p_operation_id,auth.uid()) on conflict do nothing;
 select * into v_row from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id for update;
 if v_row.created_by<>auth.uid() then raise exception 'Operation owner conflict';end if;
 return jsonb_build_object('operation_id',p_operation_id,'status',v_row.status,'result',v_row.result);
end $$;

-- Retakes INSERT a new path; no upsert. Captured evidence cannot be overwritten or
-- deleted by ordinary members. Cleanup is authorized only after RESOLVED.
create function pharmflow_expiry_private.guard_photo() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_path text;v_op pharmflow_expiry_private.operations%rowtype;v_photo pharmflow_expiry_private.photos%rowtype;v_p uuid;v_id uuid;v_role text;
begin
 if tg_op='UPDATE' then
  if (old.bucket_id='pharmflow-needs-review' and split_part(old.name,'/',2)='expiry-v1') or
     (new.bucket_id='pharmflow-needs-review' and split_part(new.name,'/',2)='expiry-v1') then raise exception 'Expiry photos are immutable; retake with a new path';end if;
  return new;
 end if;
 if tg_op='DELETE' then v_path:=old.name;if old.bucket_id<>'pharmflow-needs-review' or split_part(v_path,'/',2)<>'expiry-v1' then return old;end if;
 else v_path:=new.name;if new.bucket_id<>'pharmflow-needs-review' or split_part(v_path,'/',2)<>'expiry-v1' then return new;end if;end if;
 if v_path !~ '^[0-9a-f-]{36}/expiry-v1/[0-9a-f-]{36}/(product|expiry)/[0-9a-f-]{36}\.(jpg|png|webp)$' then raise exception 'Invalid Expiry photo path';end if;
 v_p:=split_part(v_path,'/',1)::uuid;v_id:=split_part(v_path,'/',3)::uuid;v_role:=split_part(v_path,'/',4);
 select * into v_op from pharmflow_expiry_private.operations where pharmacy_id=v_p and operation_id=v_id for update;
 if not found or auth.uid() is null or public.is_pharmacy_member(v_p) is not true then raise exception 'Photo scope denied';end if;
 if tg_op='INSERT' then
  if v_op.status<>'RESERVED' or v_op.created_by<>auth.uid() or coalesce(new.owner_id,new.owner::text) is distinct from auth.uid()::text then raise exception 'Photo upload denied';end if;
  if new.metadata->>'mimetype' is null or new.metadata->>'mimetype' not in ('image/jpeg','image/png','image/webp') or coalesce((new.metadata->>'size')::bigint,0) not between 1 and 5242880 then raise exception 'Invalid photo type or size';end if;
  insert into pharmflow_expiry_private.photos(path,pharmacy_id,operation_id,role,created_by) values(v_path,v_p,v_id,v_role,auth.uid());return new;
 end if;
 select * into v_photo from pharmflow_expiry_private.photos where path=v_path;
 if v_op.status='RESERVED' and v_photo.created_by=auth.uid() then
  update pharmflow_expiry_private.photos set deleted_at=now() where path=v_path;return old;
 end if;
 if v_op.status<>'COMMITTED' or public.is_pharmacy_admin(v_p) is not true or v_photo.cleanup_by is distinct from auth.uid() or v_photo.cleanup_until is null or v_photo.cleanup_until<now()
 or not exists(select 1 from pharmflow_expiry_private.review_details d join public.pharmflow_needs_review_v2 r on r.id=d.review_id where d.pharmacy_id=v_p and d.operation_id=v_id and r.workflow='EXPIRY' and r.status='RESOLVED') then raise exception 'Resolved Expiry cleanup authorization required';end if;
 update pharmflow_expiry_private.photos set deleted_at=now(),cleanup_by=null,cleanup_until=null where path=v_path;return old;
end $$;
create trigger pharmflow_expiry_photo_guard before insert or update or delete on storage.objects for each row execute function pharmflow_expiry_private.guard_photo();
revoke all on function pharmflow_expiry_private.guard_photo() from public,anon,authenticated;

-- Parse supported GS1 AIs without numeric collapse. Unknown AIs are rejected,
-- not guessed. Raw scanner bytes remain in the operation payload unchanged.
create function pharmflow_expiry_private.scan_facts(p_raw text,p_format text) returns jsonb
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare s text:=btrim(p_raw,E' \r\n\t');v_ai text;v_value text;v_facts jsonb:='{}';v_stop integer;v_fixed integer;
begin
 if s is null or s='' then raise exception 'Raw scan required';end if;
 if s ~ '^\][A-Za-z][0-9]' then s:=substr(s,4);end if;
 if p_format='PLAIN' then return jsonb_build_object('identifier',s);end if;
 if p_format is distinct from 'GS1' then raise exception 'Invalid scan format';end if;
 while length(s)>0 loop
  if left(s,1)=chr(29) then s:=substr(s,2);continue;end if;
  if left(s,1)='(' then
   if s !~ '^\((01|17|10|21)\)' then raise exception 'Unsupported GS1 AI';end if;
   v_ai:=substr(s,2,2);s:=substr(s,5);v_stop:=strpos(s,'(');if v_stop=0 then v_stop:=length(s)+1;end if;
   v_value:=substr(s,1,v_stop-1);s:=substr(s,v_stop);
  else
   v_ai:=left(s,2);s:=substr(s,3);v_fixed:=case v_ai when '01' then 14 when '17' then 6 else null end;
   if v_ai not in ('01','17','10','21') then raise exception 'Unsupported GS1 AI';end if;
   if v_fixed is not null then v_value:=left(s,v_fixed);s:=substr(s,v_fixed+1);
   else v_stop:=strpos(s,chr(29));if v_stop=0 then v_stop:=length(s)+1;end if;v_value:=left(s,v_stop-1);s:=substr(s,v_stop);end if;
  end if;
  if v_facts ? v_ai then raise exception 'Duplicate GS1 AI';end if;
  if (v_ai='01' and v_value !~ '^[0-9]{14}$') or (v_ai='17' and v_value !~ '^[0-9]{6}$') or (v_ai in ('10','21') and length(v_value) not between 1 and 20) then raise exception 'Invalid GS1 value';end if;
  v_facts:=v_facts||jsonb_build_object(v_ai,v_value);
 end loop;
 if not v_facts ? '01' then raise exception 'GS1 GTIN required';end if;
 return v_facts||jsonb_build_object('identifier',v_facts->>'01');
end $$;
revoke all on function pharmflow_expiry_private.scan_facts(text,text) from public,anon,authenticated;

create function public.save_pharmflow_expiry_capture_v3(p_pharmacy_id uuid,p_operation_id uuid,p_capture jsonb)
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
  v_product:=p_capture->>'product_photo_path';v_expiry:=p_capture->>'expiry_photo_path';
  if v_product is null or v_expiry is null or v_product=v_expiry then raise exception 'Both photos required';end if;
  -- Operation lock also serializes Storage deletion against finalization.
  if not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o on o.name=p.path and o.bucket_id='pharmflow-needs-review' where p.path=v_product and p.pharmacy_id=p_pharmacy_id and p.operation_id=p_operation_id and p.role='product' and p.created_by=auth.uid() and p.deleted_at is null)
   or not exists(select 1 from pharmflow_expiry_private.photos p join storage.objects o on o.name=p.path and o.bucket_id='pharmflow-needs-review' where p.path=v_expiry and p.pharmacy_id=p_pharmacy_id and p.operation_id=p_operation_id and p.role='expiry' and p.created_by=auth.uid() and p.deleted_at is null) then raise exception 'Both uploaded role-correct photos required';end if;
  insert into public.pharmflow_needs_review_v2(pharmacy_id,workflow,gtin,identifier_display,identifier_key,raw_barcode,pending_quantity,review_reason,source,device_id,created_by,operation_id)
  values(p_pharmacy_id,'EXPIRY',v_identifier,v_identifier,public.pharmflow_identifier_key_v2(v_identifier),p_capture->>'raw_scan',v_qty,'UNKNOWN_GTIN',p_capture->>'source',p_capture->>'device_id',auth.uid(),p_operation_id::text) returning id into v_review;
  insert into pharmflow_expiry_private.review_details values(v_review,p_pharmacy_id,p_operation_id,v_worker_name,v_product,v_expiry);
  v_result:=jsonb_build_object('operation_id',p_operation_id,'review_id',v_review,'quantity',v_qty,'product_photo_path',v_product,'expiry_photo_path',v_expiry);
 end if;
 update pharmflow_expiry_private.operations set status='COMMITTED',result=v_result where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id;return v_result;
end $$;

-- Block other V2 creators (and direct inserts) from creating incomplete Expiry
-- reviews. Receiving INSERT/UPDATE/DELETE passes through byte-for-byte.
create function pharmflow_expiry_private.guard_review() returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if tg_op='INSERT' then
  if new.workflow='EXPIRY' and not exists(select 1 from pharmflow_expiry_private.operations o where o.pharmacy_id=new.pharmacy_id and o.operation_id::text=new.operation_id and o.created_by=auth.uid() and o.status='COMMITTING' and o.payload->>'kind'='UNKNOWN') then raise exception 'Expiry review requires complete operation capture';end if;return new;
 end if;
 if old.workflow<>'EXPIRY' then
  if tg_op='UPDATE' and new.workflow='EXPIRY' then raise exception 'Workflow reassignment denied';end if;
  if tg_op='DELETE' then return old;else return new;end if;
 end if;
 if not exists(select 1 from pharmflow_expiry_private.review_details where review_id=old.id) then
  if tg_op='DELETE' then return old;else return new;end if;
 end if;
 if tg_op='DELETE' then raise exception 'Expiry review audit cannot be deleted';end if;
 if row(new.id,new.created_at,new.review_reason,new.pharmacy_id,new.workflow,new.gtin,new.identifier_display,new.identifier_key,new.raw_barcode,new.pending_quantity,new.source,new.device_id,new.created_by,new.operation_id,new.photo_path) is distinct from row(old.id,old.created_at,old.review_reason,old.pharmacy_id,old.workflow,old.gtin,old.identifier_display,old.identifier_key,old.raw_barcode,old.pending_quantity,old.source,old.device_id,old.created_by,old.operation_id,old.photo_path) then raise exception 'Expiry capture evidence is immutable';end if;
 if new.status=old.status and row(new.resolved_by,new.resolved_item_code,new.resolved_item_name) is distinct from row(old.resolved_by,old.resolved_item_code,old.resolved_item_name) then raise exception 'Resolution attribution is immutable outside successful resolution';end if;
 if new.status is distinct from old.status and (old.status<>'PENDING' or new.status<>'RESOLVED' or public.is_pharmacy_admin(old.pharmacy_id) is not true or new.resolved_by is distinct from auth.uid() or coalesce(btrim(new.resolved_item_code),'')='' or coalesce(btrim(new.resolved_item_name),'')='') then raise exception 'Authorized successful resolution required';end if;
 return new;
end $$;
create trigger pharmflow_expiry_review_guard before insert or update or delete on public.pharmflow_needs_review_v2 for each row execute function pharmflow_expiry_private.guard_review();
revoke all on function pharmflow_expiry_private.guard_review() from public,anon,authenticated;

create function public.get_pharmflow_expiry_capture_operation_v1(p_pharmacy_id uuid,p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_result jsonb;
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select result into v_result from pharmflow_expiry_private.operations where pharmacy_id=p_pharmacy_id and operation_id=p_operation_id and created_by=auth.uid();return v_result;
end $$;
create function public.get_pharmflow_expiry_review_v1(p_pharmacy_id uuid,p_review_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v_result jsonb;
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 select o.payload||jsonb_build_object('review_id',r.id,'pharmacy_id',r.pharmacy_id,'identifier_key',r.identifier_key,'status',r.status,'created_by',r.created_by,'created_at',r.created_at,'review_reason',r.review_reason,'resolved_by',r.resolved_by,'resolved_item_code',r.resolved_item_code,'resolved_item_name',r.resolved_item_name,'worker_name',d.worker_name,'product_photo_path',d.product_photo_path,'expiry_photo_path',d.expiry_photo_path,'product_photo_deleted',p.deleted_at is not null,'expiry_photo_deleted',e.deleted_at is not null)
 into v_result from public.pharmflow_needs_review_v2 r join pharmflow_expiry_private.review_details d on d.review_id=r.id and d.pharmacy_id=r.pharmacy_id join pharmflow_expiry_private.operations o on o.pharmacy_id=d.pharmacy_id and o.operation_id=d.operation_id join pharmflow_expiry_private.photos p on p.path=d.product_photo_path join pharmflow_expiry_private.photos e on e.path=d.expiry_photo_path where r.id=p_review_id and r.pharmacy_id=p_pharmacy_id and r.workflow='EXPIRY';return v_result;
end $$;
create function public.authorize_pharmflow_expiry_photo_cleanup_v1(p_pharmacy_id uuid,p_review_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare d pharmflow_expiry_private.review_details%rowtype;v_paths jsonb;
begin
 if auth.uid() is null or p_pharmacy_id is null or public.is_pharmacy_admin(p_pharmacy_id) is not true then raise exception 'Pharmacy admin required';end if;
 select x.* into d from pharmflow_expiry_private.review_details x join public.pharmflow_needs_review_v2 r on r.id=x.review_id and r.pharmacy_id=x.pharmacy_id where x.review_id=p_review_id and x.pharmacy_id=p_pharmacy_id and r.workflow='EXPIRY' and r.status='RESOLVED';
 if not found then raise exception 'Successfully resolved Expiry review required';end if;
 perform 1 from pharmflow_expiry_private.operations where pharmacy_id=d.pharmacy_id and operation_id=d.operation_id for update;
 update pharmflow_expiry_private.photos set cleanup_by=auth.uid(),cleanup_until=now()+interval '10 minutes' where pharmacy_id=d.pharmacy_id and operation_id=d.operation_id and deleted_at is null;
 select coalesce(jsonb_agg(path),'[]'::jsonb) into v_paths from pharmflow_expiry_private.photos where pharmacy_id=d.pharmacy_id and operation_id=d.operation_id and deleted_at is null;
 return jsonb_build_object('bucket','pharmflow-needs-review','paths',v_paths,'expires_at',now()+interval '10 minutes');
end $$;
-- All privileged functions have explicit access grants; private helpers stay private.
revoke all on function public.reserve_pharmflow_expiry_capture_v1(uuid,uuid),public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb),public.get_pharmflow_expiry_capture_operation_v1(uuid,uuid),public.get_pharmflow_expiry_review_v1(uuid,uuid),public.authorize_pharmflow_expiry_photo_cleanup_v1(uuid,uuid) from public,anon;
grant execute on function public.reserve_pharmflow_expiry_capture_v1(uuid,uuid),public.save_pharmflow_expiry_capture_v3(uuid,uuid,jsonb),public.get_pharmflow_expiry_capture_operation_v1(uuid,uuid),public.get_pharmflow_expiry_review_v1(uuid,uuid),public.authorize_pharmflow_expiry_photo_cleanup_v1(uuid,uuid) to authenticated;

-- Narrow additional DELETE policy: only the uploader's uncommitted Expiry
-- staging objects. Other Storage paths keep their exact existing policies.
create function public.can_delete_pharmflow_expiry_staged_photo_v1(p_name text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from pharmflow_expiry_private.photos p join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id) where p.path=p_name and p.created_by=auth.uid() and o.created_by=auth.uid() and o.status='RESERVED' and public.is_pharmacy_member(p.pharmacy_id) is true)
$$;
revoke all on function public.can_delete_pharmflow_expiry_staged_photo_v1(text) from public,anon;
grant execute on function public.can_delete_pharmflow_expiry_staged_photo_v1(text) to authenticated;
create policy pharmflow_expiry_staged_photo_delete on storage.objects for delete to authenticated
using(bucket_id='pharmflow-needs-review' and split_part(name,'/',2)='expiry-v1' and public.can_delete_pharmflow_expiry_staged_photo_v1(name));
