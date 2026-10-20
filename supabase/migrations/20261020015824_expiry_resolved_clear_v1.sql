-- Staging-only additive operational-list clearing; no operational DELETE or inventory mutation.
alter table pharmflow_expiry_private.resolved_inventory_v1
 add column cleared_at timestamptz,
 add column cleared_by uuid;
alter table pharmflow_expiry_private.resolved_inventory_v1
 add constraint resolved_clear_actor_pair_v1 check ((cleared_at is null)=(cleared_by is null)),
 add constraint resolved_clear_restore_exclusive_v1 check (cleared_at is null or restored_at is null);
create index resolved_inventory_uncleared_v1
 on pharmflow_expiry_private.resolved_inventory_v1(pharmacy_id,resolved_at desc,id)
 where restored_at is null and cleared_at is null;

CREATE OR REPLACE FUNCTION pharmflow_expiry_private.inventory_rows_v1(p_pharmacy uuid, p_resolved boolean)
 RETURNS TABLE(row_id uuid, state_id uuid, item_code text, item_name text, identifier_display text, department text, batch_no text, expiry_month integer, expiry_year integer, quantity integer, updated_at timestamp with time zone, added_at timestamp with time zone, status text, version text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
 with source as (
 select s.id row_id,s.id state_id,to_jsonb(s) facts,s.verified_quantity quantity,s.last_verified_at stamp,'ACTIVE'::text status
 from public.pharmflow_expiry_current_state_v1 s where not p_resolved and s.pharmacy_id=p_pharmacy and s.status='ACTIVE'
 union all
 select r.id,r.state_id,r.snapshot,r.quantity,r.resolved_at,'RESOLVED'
 from pharmflow_expiry_private.resolved_inventory_v1 r where p_resolved and r.pharmacy_id=p_pharmacy and r.restored_at is null and r.cleared_at is null
 )
 select s.row_id,s.state_id,s.facts->>'item_code',s.facts->>'item_name',s.facts->>'identifier_display',
 coalesce(nullif(g.group_name,''),nullif(s.facts->>'category',''),'Uncategorized'),s.facts->>'batch_no',
 (s.facts->>'expiry_month')::integer,(s.facts->>'expiry_year')::integer,s.quantity,s.stamp,
 coalesce(e.stamp,(s.facts->>'created_at')::timestamptz,s.stamp),s.status,
 md5(s.facts::text||s.quantity::text||s.stamp::text)
 from source s left join public.pharmflow_global_items_v2 g on g.item_code=s.facts->>'item_code'
 left join lateral (select max(occurred_at) stamp from public.pharmflow_expiry_events_v1 x
 where x.state_id=s.state_id and x.event_type='CAPTURE') e on true
$function$
;
CREATE OR REPLACE FUNCTION pharmflow_expiry_private.inventory_rows_group_v1(p_pharmacy uuid, p_resolved boolean)
 RETURNS TABLE(row_id uuid, state_id uuid, item_code text, item_name text, identifier_display text, department text, group_name text, batch_no text, expiry_month integer, expiry_year integer, quantity integer, updated_at timestamp with time zone, added_at timestamp with time zone, status text, version text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
  with source as (
    select s.id row_id,s.id state_id,to_jsonb(s) facts,s.verified_quantity quantity,
           s.last_verified_at stamp,'ACTIVE'::text status
    from public.pharmflow_expiry_current_state_v1 s
    where not p_resolved and s.pharmacy_id=p_pharmacy and s.status='ACTIVE'
    union all
    select r.id,r.state_id,r.snapshot,r.quantity,r.resolved_at,'RESOLVED'
    from pharmflow_expiry_private.resolved_inventory_v1 r
    where p_resolved and r.pharmacy_id=p_pharmacy and r.restored_at is null and r.cleared_at is null
  )
  select s.row_id,s.state_id,s.facts->>'item_code',s.facts->>'item_name',
         s.facts->>'identifier_display',
         coalesce(nullif(g.group_name,''),nullif(s.facts->>'category',''),'Uncategorized'),
         public.pharmflow_normalize_main_group_v1(g.group_name),
         s.facts->>'batch_no',(s.facts->>'expiry_month')::integer,
         (s.facts->>'expiry_year')::integer,s.quantity,s.stamp,
         coalesce(e.stamp,(s.facts->>'created_at')::timestamptz,s.stamp),s.status,
         md5(s.facts::text||s.quantity::text||s.stamp::text)
  from source s
  left join public.pharmflow_global_items_v2 g on g.item_code=s.facts->>'item_code'
  left join lateral (
    select max(x.occurred_at) stamp from public.pharmflow_expiry_events_v1 x
    where x.state_id=s.state_id and x.event_type='CAPTURE'
  ) e on true
$function$
;
CREATE OR REPLACE FUNCTION public.mutate_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_request_id uuid, p_action text, p_selection jsonb, p_quantity integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare payload jsonb:=jsonb_build_object('action',p_action,'selection',p_selection,'quantity',p_quantity);
 prior pharmflow_expiry_private.inventory_requests_v1%rowtype;sel jsonb;viewrow record;s public.pharmflow_expiry_current_state_v1%rowtype;
 resolved pharmflow_expiry_private.resolved_inventory_v1%rowtype;stamp timestamptz;oldqty integer;newqty integer;n integer:=0;result jsonb;lockkey text;
begin
 perform pharmflow_expiry_private.valid_auth_session();
 if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required';end if;
 if p_action='CLEAR_RESOLVED' and not exists (
  select 1 from public.pharmacy_members m join public.pharmacies p on p.id=m.pharmacy_id
  where m.pharmacy_id=p_pharmacy_id and m.user_id=auth.uid() and m.active=true and p.status='active'
 ) then raise exception 'Pharmacy access required';end if;
 if p_request_id is null or p_action is null or p_selection is null or p_action not in ('QUANTITY','RESOLVE','RESTORE','CLEAR_RESOLVED') or jsonb_typeof(p_selection)<>'array' or jsonb_array_length(p_selection)=0 then raise exception 'Explicit selection required';end if;
 if p_action='QUANTITY' and (jsonb_array_length(p_selection)<>1 or p_quantity is null or p_quantity<0) then raise exception 'Nonnegative integer quantity required';end if;
 perform pg_advisory_xact_lock(hashtextextended('expiry-inventory-request/'||p_request_id::text,0));
 select * into prior from pharmflow_expiry_private.inventory_requests_v1 where request_id=p_request_id;
 if found then if prior.pharmacy_id<>p_pharmacy_id or prior.created_by<>auth.uid() or prior.payload is distinct from payload then raise exception 'Request payload conflict';end if;return prior.result;end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_selection) x)<>jsonb_array_length(p_selection) then raise exception 'Duplicate selection';end if;
 -- Acquire the SAME canonical item locks used by captures, in a stable order.
 for lockkey in select distinct p_pharmacy_id::text||'/item/'||r.item_code||'/'||upper(btrim(coalesce(r.batch_no,'')))||'/'||r.expiry_year||'/'||r.expiry_month
 from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_action in ('RESTORE','CLEAR_RESOLVED')) r
 where r.row_id in(select (x->>'id')::uuid from jsonb_array_elements(p_selection) x) order by 1
 loop perform pg_advisory_xact_lock(hashtextextended(lockkey,0));end loop;
 for sel in select x from jsonb_array_elements(p_selection) x order by x->>'id' loop
  select * into viewrow from pharmflow_expiry_private.inventory_rows_v1(p_pharmacy_id,p_action in ('RESTORE','CLEAR_RESOLVED')) r where r.row_id=(sel->>'id')::uuid;
  if not found or viewrow.version is distinct from sel->>'version' then raise exception 'Inventory changed; refresh and confirm selection again';end if;
  if p_action='CLEAR_RESOLVED' then
   -- Same canonical advisory locks as Restore/Capture, then a row-level eligibility recheck.
   update pharmflow_expiry_private.resolved_inventory_v1 r
    set cleared_at=clock_timestamp(),cleared_by=auth.uid()
    where r.id=viewrow.row_id and r.pharmacy_id=p_pharmacy_id and r.restored_at is null and r.cleared_at is null;
   if not found then raise exception 'Resolved list changed; refresh and confirm again';end if;
   n:=n+1;
   continue;
  end if;
  select * into s from public.pharmflow_expiry_current_state_v1 where id=viewrow.state_id and pharmacy_id=p_pharmacy_id for update;
  if not found then raise exception 'Inventory state unavailable';end if;
  stamp:=clock_timestamp();oldqty:=s.verified_quantity;
  if p_action='RESOLVE' then
   insert into pharmflow_expiry_private.resolved_inventory_v1(pharmacy_id,state_id,snapshot,quantity,resolved_at,resolved_by) values(p_pharmacy_id,s.id,to_jsonb(s),oldqty,stamp,auth.uid());newqty:=0;
  elsif p_action='RESTORE' then
   select * into resolved from pharmflow_expiry_private.resolved_inventory_v1 where id=viewrow.row_id and pharmacy_id=p_pharmacy_id and restored_at is null and cleared_at is null for update;
   if not found then raise exception 'Resolved row changed';end if;
   if s.item_code is distinct from resolved.snapshot->>'item_code' or s.batch_key is distinct from resolved.snapshot->>'batch_key' or s.expiry_year<>(resolved.snapshot->>'expiry_year')::integer or s.expiry_month<>(resolved.snapshot->>'expiry_month')::integer then raise exception 'Original identity changed; restore blocked';end if;
   newqty:=case when s.status='ACTIVE' then oldqty else 0 end+resolved.quantity;
   update pharmflow_expiry_private.resolved_inventory_v1 set restored_at=stamp,restored_by=auth.uid() where id=resolved.id;
  else newqty:=p_quantity;end if;
  update public.pharmflow_expiry_current_state_v1 set verified_quantity=newqty,status=case when p_action='RESOLVE' then 'CLEARED' else 'ACTIVE' end,
   verified_by_user_id=auth.uid(),last_verified_at=stamp,updated_at=stamp where id=s.id;
  insert into public.pharmflow_expiry_events_v1(state_id,pharmacy_id,event_type,item_code,item_name,identifier_display,identifier_key,category,batch_no,sample_serial,expiry_month,expiry_year,previous_quantity,verified_quantity,worker_id,verified_by_name,verified_by_user_id,device_id,source,occurred_at)
  values(s.id,p_pharmacy_id,case when p_action='RESOLVE' then 'CLEARED' else 'RECOUNT' end,s.item_code,s.item_name,s.identifier_display,s.identifier_key,s.category,s.batch_no,s.sample_serial,s.expiry_month,s.expiry_year,oldqty,newqty,s.worker_id,s.verified_by_name,auth.uid(),s.device_id,'PC',stamp);
  n:=n+1;
 end loop;
 result:=jsonb_build_object('request_id',p_request_id,'count',n,'action',p_action);
 insert into pharmflow_expiry_private.inventory_requests_v1 values(p_request_id,p_pharmacy_id,auth.uid(),payload,result,clock_timestamp());
 return result;
end $function$
;
-- Keep the existing endpoint signature and permissions; private projections stay inaccessible.
revoke all on function pharmflow_expiry_private.inventory_rows_v1(uuid,boolean) from public,anon,authenticated;
revoke all on function pharmflow_expiry_private.inventory_rows_group_v1(uuid,boolean) from public,anon,authenticated;
revoke all on function public.mutate_pharmflow_expiry_inventory_v1(uuid,uuid,text,jsonb,integer) from public,anon;
grant execute on function public.mutate_pharmflow_expiry_inventory_v1(uuid,uuid,text,jsonb,integer) to authenticated;
