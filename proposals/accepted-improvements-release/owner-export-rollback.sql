-- PREPARED ONLY. After approved UI rollback. No CASCADE; no Master/history/Auth changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
BEGIN
 IF (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.owner_export_global_items_page_v2(text,text,integer,text)')) IS DISTINCT FROM '49c29a548cf2959fe0575bcc1c0ff32f'
 OR (select md5(prosrc) from pg_proc where oid=to_regprocedure('pharmflow_export_private.bump_master_revision()')) IS DISTINCT FROM '4b08588f1b604fe3fe1096bc0eabfeda'
 OR (select count(*) from pg_trigger where tgname in ('pharmflow_export_revision_items','pharmflow_export_revision_identifiers') and tgfoid=to_regprocedure('pharmflow_export_private.bump_master_revision()') and (tgtype::int & 3)=2)<>2 THEN RAISE EXCEPTION 'Export V2 rollback drift: STOP';END IF;
END $guard$;
DROP FUNCTION public.owner_export_global_items_page_v2(text,text,integer,text);
DROP TRIGGER pharmflow_export_revision_items ON public.pharmflow_global_items_v2;
DROP TRIGGER pharmflow_export_revision_identifiers ON public.pharmflow_global_item_identifiers_v2;
DROP FUNCTION pharmflow_export_private.bump_master_revision();
DROP TABLE pharmflow_export_private.master_revision;
DROP SCHEMA pharmflow_export_private;
COMMIT;
