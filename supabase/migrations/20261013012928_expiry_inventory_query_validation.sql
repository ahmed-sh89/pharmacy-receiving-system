-- Tighten explicit NULL handling without changing API signatures or permissions.
do $validation$
declare d text;
begin
 select pg_get_functiondef('public.query_pharmflow_expiry_inventory_v1(uuid,jsonb,boolean,text,integer,integer)'::regprocedure) into d;
 if strpos(d,'if p_limit not between')=0 then raise exception 'Unexpected Inventory query contract';end if;
 d:=replace(d,'if p_limit not between','if p_limit is null or p_offset is null or p_sort is null or p_filters is null or p_resolved is null or p_limit not between');execute d;
 select pg_get_functiondef('public.mutate_pharmflow_expiry_inventory_v1(uuid,uuid,text,jsonb,integer)'::regprocedure) into d;
 if strpos(d,'if p_request_id is null or p_action not in')=0 then raise exception 'Unexpected Inventory mutation contract';end if;
 d:=replace(d,'if p_request_id is null or p_action not in','if p_request_id is null or p_action is null or p_selection is null or p_action not in');execute d;
end $validation$;
