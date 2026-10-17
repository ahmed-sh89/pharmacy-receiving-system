do $$ begin
if md5(pg_get_functiondef('public.list_pharmflow_expiry_reviews_v1(uuid,text,integer,integer)'::regprocedure))<>'3af86756401a9efa079f9d3dc06e5a36' or md5(pg_get_functiondef('public.resolve_pharmflow_expiry_review_v1(uuid,uuid,uuid,text,text)'::regprocedure))<>'27c7183de79d20a33cf88a42798f2310' then raise exception 'Staging review definitions changed; stop';end if;
if to_regclass('pharmflow_expiry_private.active_sessions_v1') is not null then raise exception 'Session migration already present; stop';end if;
end $$;
