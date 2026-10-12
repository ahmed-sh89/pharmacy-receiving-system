begin;
-- Staging only. Same signature, JSON contract, ordering, owner, ACL and guards.
-- Historical captures and deletion/audit records are never modified.
do $migration$
declare d text;before_acl text;before_owner oid;before_config text[];before_definer boolean;
begin
 select pg_get_functiondef(p.oid),p.proacl::text,p.proowner,p.proconfig,p.prosecdef into d,before_acl,before_owner,before_config,before_definer from pg_proc p where p.oid='public.list_pharmflow_expiry_session_v2(uuid,uuid)'::regprocedure;
 if md5(d)<>'97196a5035913275c4a9a34b71a0ef1a' then raise exception 'History definition changed; stop';end if;
 d:=replace(d,'where c.session_id=p_session_id order by','where c.session_id=p_session_id and c.quantity>0 and n.status is distinct from ''DELETED'' order by');
 execute d;
 if exists(select 1 from pg_proc p where p.oid='public.list_pharmflow_expiry_session_v2(uuid,uuid)'::regprocedure and (p.proacl::text is distinct from before_acl or p.proowner<>before_owner or p.proconfig is distinct from before_config or p.prosecdef is distinct from before_definer)) then raise exception 'History security metadata changed';end if;
end $migration$;
commit;
