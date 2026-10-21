-- Staging only. Read-projection changes; no operational data, attribution or RLS changes.
-- CREATE OR REPLACE retains exact signatures, owners and existing EXECUTE ACLs.
CREATE OR REPLACE FUNCTION pharmflow_expiry_private.inventory_match_v1(r jsonb, f jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select
    (coalesce(f->>'search','')='' or exists(
      select 1 from unnest(array[r->>'item_name',r->>'item_code',r->>'identifier_display',r->>'batch_no']) v
      where strpos(lower(coalesce(v,'')),lower(btrim(f->>'search')))>0
    ))
    and (coalesce(jsonb_array_length(f->'departments'),0)=0 or (f->'departments') ? (r->>'department'))
    and (
      (coalesce(jsonb_array_length(f->'groups'),0)=0 and not coalesce((f->>'include_unassigned')::boolean,false))
      or (r->>'group_name')=any(array(
        select public.pharmflow_normalize_main_group_v1(v)
        from jsonb_array_elements_text(coalesce(f->'groups','[]'::jsonb)) v
        where public.pharmflow_normalize_main_group_v1(v) is not null
      ))
      or (coalesce((f->>'include_unassigned')::boolean,false) and r->>'group_name' is null)
    )
    and (coalesce(jsonb_array_length(f->'operators'),0)=0 or (f->'operators') ? (r->>'first_operator_name'))
    and (coalesce(jsonb_array_length(f->'months'),0)=0 or (f->'months') ? ((r->>'expiry_year')||'-'||lpad(r->>'expiry_month',2,'0')))
    and (not(f ? 'from') or ((r->>'expiry_year')::integer*12+(r->>'expiry_month')::integer)>= (f->>'from')::integer)
    and (not(f ? 'to') or ((r->>'expiry_year')::integer*12+(r->>'expiry_month')::integer)<= (f->>'to')::integer)
$function$;

CREATE OR REPLACE FUNCTION public.query_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_filters jsonb DEFAULT '{}'::jsonb, p_resolved boolean DEFAULT false, p_sort text DEFAULT 'ADDED'::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare result jsonb; filters jsonb:=coalesce(p_filters,'{}'::jsonb);
begin
  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  if p_filters is null or p_resolved is null or p_sort is null or p_offset is null or p_limit is null
     or p_limit not between 1 and 250 or p_offset<0 or jsonb_typeof(filters)<>'object'
     or p_sort not in ('ADDED','UPDATED','EXPIRY')
     or (filters ? 'groups' and jsonb_typeof(filters->'groups')<>'array')
     or (filters ? 'departments' and jsonb_typeof(filters->'departments')<>'array')
     or (filters ? 'operators' and (jsonb_typeof(filters->'operators')<>'array' or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(filters->'operators')='array' then filters->'operators' else '[]'::jsonb end) v where jsonb_typeof(v)<>'string')))
     or (filters ? 'months' and jsonb_typeof(filters->'months')<>'array')
     or (filters ? 'include_unassigned' and jsonb_typeof(filters->'include_unassigned')<>'boolean') then
    raise exception 'Invalid inventory query';
  end if;
  with rows as materialized (
    select * from pharmflow_expiry_private.inventory_rows_group_v1(p_pharmacy_id,p_resolved)
  ), matching as materialized (
    select * from rows r where pharmflow_expiry_private.inventory_match_v1(case when coalesce(jsonb_array_length(filters->'operators'),0)>0 then pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(r)) else to_jsonb(r) end,filters)
  ), page as (
    select * from matching order by
      case when p_sort='EXPIRY' then expiry_year*12+expiry_month end asc,
      case when p_sort='UPDATED' or p_resolved then updated_at end desc,
      case when p_sort='ADDED' and not p_resolved then added_at end desc,row_id
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(p))) from page p),'[]'::jsonb),
    'count',(select count(*) from matching),
    'units',(select coalesce(sum(quantity),0) from matching),
    'departments',(select coalesce(jsonb_agg(d order by d),'[]'::jsonb) from (select distinct department d from rows) v),
    'groups',jsonb_build_array('Beauty','FMCG','HomeHealth','Medicine','Mom & Baby','Supplement'),
    'has_unassigned_group',(select exists(select 1 from rows where group_name is null)),
    'operators',(select coalesce(jsonb_agg(v.name order by v.name),'[]'::jsonb) from (select distinct f.operator_name name from rows r join pharmflow_expiry_private.first_operator_v1 f on f.state_id=r.state_id and f.pharmacy_id=p_pharmacy_id where nullif(btrim(f.operator_name),'') is not null) v),
    'months',(select coalesce(jsonb_agg(m order by m),'[]'::jsonb) from (select distinct expiry_year::text||'-'||lpad(expiry_month::text,2,'0') m from rows) v)
  ) into result;
  return result;
end
$function$;

CREATE OR REPLACE FUNCTION public.select_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_filters jsonb, p_resolved boolean, p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare result jsonb; filters jsonb:=coalesce(p_filters,'{}'::jsonb);
begin
  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  if p_filters is null or p_resolved is null or jsonb_typeof(filters)<>'object'
     or (filters ? 'groups' and jsonb_typeof(filters->'groups')<>'array')
     or (filters ? 'departments' and jsonb_typeof(filters->'departments')<>'array')
     or (filters ? 'operators' and (jsonb_typeof(filters->'operators')<>'array' or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(filters->'operators')='array' then filters->'operators' else '[]'::jsonb end) v where jsonb_typeof(v)<>'string')))
     or (filters ? 'months' and jsonb_typeof(filters->'months')<>'array')
     or (filters ? 'include_unassigned' and jsonb_typeof(filters->'include_unassigned')<>'boolean') then
    raise exception 'Invalid inventory query';
  end if;
  select jsonb_build_object('count',count(*),'units',coalesce(sum(r.quantity),0),
    'selection',coalesce(jsonb_agg(jsonb_build_object('id',r.row_id,'version',r.version) order by r.row_id),'[]'::jsonb))
  into result
  from pharmflow_expiry_private.inventory_rows_group_v1(p_pharmacy_id,p_resolved) r
  where pharmflow_expiry_private.inventory_match_v1(case when coalesce(jsonb_array_length(filters->'operators'),0)>0 then pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(r)) else to_jsonb(r) end,filters)
    and (p_ids is null or r.row_id=any(p_ids));
  return result;
end
$function$;

CREATE OR REPLACE FUNCTION public.export_pharmflow_expiry_inventory_v1(p_pharmacy_id uuid, p_filters jsonb, p_resolved boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pharmflow_expiry_private', 'pg_temp'
AS $function$
declare result jsonb; filters jsonb:=coalesce(p_filters,'{}'::jsonb);
begin
  perform pharmflow_expiry_private.valid_auth_session();
  if public.is_pharmacy_member(p_pharmacy_id) is not true then raise exception 'Pharmacy access required'; end if;
  if p_filters is null or p_resolved is null or jsonb_typeof(filters)<>'object'
     or (filters ? 'groups' and jsonb_typeof(filters->'groups')<>'array')
     or (filters ? 'departments' and jsonb_typeof(filters->'departments')<>'array')
     or (filters ? 'operators' and (jsonb_typeof(filters->'operators')<>'array' or exists(select 1 from jsonb_array_elements(case when jsonb_typeof(filters->'operators')='array' then filters->'operators' else '[]'::jsonb end) v where jsonb_typeof(v)<>'string')))
     or (filters ? 'months' and jsonb_typeof(filters->'months')<>'array')
     or (filters ? 'include_unassigned' and jsonb_typeof(filters->'include_unassigned')<>'boolean') then
    raise exception 'Invalid inventory query';
  end if;
  select coalesce(jsonb_agg(pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(x)) order by x.expiry_year,x.expiry_month,x.item_name,x.row_id),'[]'::jsonb)
  into result
  from pharmflow_expiry_private.inventory_rows_group_v1(p_pharmacy_id,p_resolved) x
  where pharmflow_expiry_private.inventory_match_v1(case when coalesce(jsonb_array_length(filters->'operators'),0)>0 then pharmflow_expiry_private.inventory_operator_v1(p_pharmacy_id,to_jsonb(x)) else to_jsonb(x) end,filters);
  return result;
end
$function$;

CREATE OR REPLACE FUNCTION public.list_pharmflow_expiry_desktop_session_v1(p_pharmacy_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare r jsonb;
begin
 perform pharmflow_expiry_private.require_signed_session(p_pharmacy_id,p_session_id);
 select coalesce(jsonb_agg(x.receipt order by x.captured_at desc,x.operation_id desc),'[]'::jsonb) into r from (
  select coalesce(e.occurred_at,n.created_at,o.created_at) captured_at,o.operation_id,o.payload||c.facts||jsonb_build_object('group_name',(select public.pharmflow_normalize_main_group_v1(g.group_name) from public.pharmflow_global_items_v2 g where g.item_code=coalesce(c.facts->>'item_code',o.payload->>'item_code')),'worker_name',coalesce(e.verified_by_name,'Desktop'),'operation_id',o.operation_id,'pharmacy_id',o.pharmacy_id,'created_by',o.created_by,'acknowledgement',o.result,'quantity',c.quantity,'revision',c.revision,'captured_at',coalesce(e.occurred_at,n.created_at,o.created_at),'status',case when c.quantity=0 then 'DELETED' when o.payload->>'kind'='UNKNOWN' then n.status else 'SAVED' end,'editable',c.quantity>0 and (o.payload->>'kind'='KNOWN' or n.status='PENDING') and
   (o.payload->>'kind'<>'KNOWN' or not exists(
    select 1 from public.pharmflow_expiry_events_v1 external_event
    where external_event.state_id=coalesce((c.facts->>'effective_state_id')::uuid,(o.result->>'state_id')::uuid)
    and external_event.occurred_at>=(select occurred_at from public.pharmflow_expiry_events_v1 where id=coalesce((c.facts->>'effective_event_id')::uuid,(o.result->>'event_id')::uuid))
    and external_event.event_type in ('RECOUNT','CLEARED')
    and not exists(select 1 from pharmflow_expiry_private.session_adjustments_v1 adjustment where adjustment.event_id=external_event.id or coalesce(adjustment.result->'event_ids','[]'::jsonb) ? external_event.id::text)
   ))) receipt
  from pharmflow_expiry_private.session_captures_v1 c join pharmflow_expiry_private.operations o using(pharmacy_id,operation_id)
  left join public.pharmflow_expiry_events_v1 e on e.id=(o.result->>'event_id')::uuid and e.pharmacy_id=o.pharmacy_id
  left join public.pharmflow_needs_review_v2 n on n.id=(o.result->>'review_id')::uuid and n.pharmacy_id=o.pharmacy_id
  where c.session_id=p_session_id and o.payload->>'source'='PC' order by coalesce(e.occurred_at,n.created_at,o.created_at) desc,o.operation_id desc
 ) x;return r;
end $function$;
