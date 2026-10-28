-- STAGING ONLY candidate for tovkcakucyagvbzvlnks. Applied to Staging as 20261028141551_owner_export_revision_before_statement.
-- Keep export RPC, security gates, revision function/data and Master rows unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $guard$
BEGIN
 IF (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.owner_export_global_items_page_v2(text,text,integer,text)')) IS DISTINCT FROM '49c29a548cf2959fe0575bcc1c0ff32f'
 OR (select md5(prosrc) from pg_proc where oid=to_regprocedure('pharmflow_export_private.bump_master_revision()')) IS DISTINCT FROM '4b08588f1b604fe3fe1096bc0eabfeda'
 OR (select count(*) from pg_trigger where tgname in ('pharmflow_export_revision_items','pharmflow_export_revision_identifiers') and tgfoid=to_regprocedure('pharmflow_export_private.bump_master_revision()') and (tgtype::int & 3)=0)<>2
 THEN RAISE EXCEPTION 'Revision timing preflight drift: STOP';END IF;
END $guard$;
DROP TRIGGER pharmflow_export_revision_items ON public.pharmflow_global_items_v2;
DROP TRIGGER pharmflow_export_revision_identifiers ON public.pharmflow_global_item_identifiers_v2;
CREATE TRIGGER pharmflow_export_revision_items BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.pharmflow_global_items_v2 FOR EACH STATEMENT EXECUTE FUNCTION pharmflow_export_private.bump_master_revision();
CREATE TRIGGER pharmflow_export_revision_identifiers BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.pharmflow_global_item_identifiers_v2 FOR EACH STATEMENT EXECUTE FUNCTION pharmflow_export_private.bump_master_revision();
COMMIT;
