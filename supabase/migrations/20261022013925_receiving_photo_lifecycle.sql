BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
BEGIN
 IF session_user<>'postgres' OR current_user<>'postgres' THEN RAISE EXCEPTION 'Authorized executor required'; END IF;
 IF md5(pg_get_functiondef('pharmflow_expiry_private.photo_cleanup_eligible(uuid,uuid,uuid,text,text)'::regprocedure))<>'9b550a5833c1670819c38d4d027cff0a' THEN RAISE EXCEPTION 'Unexpected eligibility definition'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='pharmflow_receiving_storage_photo_guard' AND tgrelid='storage.objects'::regclass) THEN RAISE EXCEPTION 'Lifecycle already installed; do not replay'; END IF;
END $preflight$;
ALTER TABLE pharmflow_expiry_private.photo_cleanup_jobs ALTER COLUMN operation_id DROP NOT NULL;
ALTER TABLE pharmflow_expiry_private.photo_cleanup_jobs ADD CONSTRAINT photo_cleanup_receiving_scope_check CHECK (
 operation_id IS NOT NULL OR (review_id IS NOT NULL AND cleanup_reason='TERMINAL' AND
 object_path ~ ('^'||pharmacy_id::text||'/'||review_id::text||'/[0-9]{10,20}[.](jpg|png|webp)$')));

-- Existing Expiry eligibility is inserted verbatim by the package builder.
CREATE OR REPLACE FUNCTION pharmflow_expiry_private.photo_cleanup_eligible(p_pharmacy uuid,p_operation uuid,p_review uuid,p_path text,p_reason text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $fn$
SELECT (CASE WHEN p_operation IS NULL THEN
 p_reason='TERMINAL' AND p_review IS NOT NULL AND p_path ~ ('^'||p_pharmacy::text||'/'||p_review::text||'/[0-9]{10,20}[.](jpg|png|webp)$') AND EXISTS(
 SELECT 1 FROM public.pharmflow_needs_review_v2 r WHERE r.id=p_review AND r.pharmacy_id=p_pharmacy AND r.workflow='RECEIVING' AND r.status IN ('RESOLVED','DELETED'))
ELSE (SELECT EXISTS (
 SELECT 1 FROM pharmflow_expiry_private.operations o
 JOIN pharmflow_expiry_private.photos p ON p.pharmacy_id=o.pharmacy_id AND p.operation_id=o.operation_id
 WHERE o.pharmacy_id=p_pharmacy AND o.operation_id=p_operation AND p.path=p_path
 AND p_path ~ ('^'||p_pharmacy::text||'/expiry-v1/'||p_operation::text||'/(product|expiry)/[0-9a-f-]{36}\.(jpg|png|webp)$')
 AND (
  (p_reason='CANCELLED' AND p_review IS NULL AND o.status='CANCELLED'
   AND NOT EXISTS(SELECT 1 FROM pharmflow_expiry_private.review_details d WHERE d.pharmacy_id=o.pharmacy_id AND d.operation_id=o.operation_id)
   AND NOT EXISTS(SELECT 1 FROM public.pharmflow_needs_review_v2 r WHERE r.pharmacy_id=o.pharmacy_id AND r.workflow='EXPIRY' AND r.operation_id=o.operation_id::text))
  OR (o.status='COMMITTED' AND EXISTS (
   SELECT 1 FROM pharmflow_expiry_private.review_details d
   JOIN public.pharmflow_needs_review_v2 r ON r.id=d.review_id AND r.pharmacy_id=d.pharmacy_id
   WHERE d.pharmacy_id=o.pharmacy_id AND d.operation_id=o.operation_id AND d.review_id=p_review AND r.workflow='EXPIRY'
   AND ((p_reason='TERMINAL' AND r.status IN ('RESOLVED','DELETED')) OR
    (p_reason='SUPERSEDED' AND r.status IN ('PENDING','RESOLVED','DELETED')
     AND p_path IS DISTINCT FROM d.product_photo_path AND p_path IS DISTINCT FROM d.expiry_photo_path
     AND p_path IS DISTINCT FROM r.photo_path
     AND p_path IS DISTINCT FROM o.payload->>'product_photo_path'
     AND p_path IS DISTINCT FROM o.payload->>'expiry_photo_path'
     AND p_path IS DISTINCT FROM o.payload->>'evidence_photo_path'))))
 )
 )) END)
AND NOT EXISTS(SELECT 1 FROM public.pharmflow_needs_review_v2 a WHERE a.photo_path=p_path AND a.status='PENDING');
$fn$;


CREATE FUNCTION pharmflow_expiry_private.enqueue_receiving_review_photos(p_pharmacy uuid,p_review uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE r public.pharmflow_needs_review_v2%rowtype; n integer;
BEGIN
 SELECT * INTO r FROM public.pharmflow_needs_review_v2 WHERE id=p_review AND pharmacy_id=p_pharmacy AND workflow='RECEIVING' AND status IN ('RESOLVED','DELETED') FOR UPDATE;
 IF NOT FOUND THEN RETURN 0; END IF;
 INSERT INTO pharmflow_expiry_private.photo_cleanup_jobs(pharmacy_id,review_id,operation_id,object_path,cleanup_reason)
 SELECT p_pharmacy,p_review,NULL,q.path,'TERMINAL' FROM (
  SELECT o.name path FROM storage.objects o WHERE o.bucket_id='pharmflow-needs-review' AND o.name LIKE p_pharmacy::text||'/'||p_review::text||'/%'
  UNION SELECT r.photo_path WHERE r.photo_path IS NOT NULL
 ) q WHERE q.path ~ ('^'||p_pharmacy::text||'/'||p_review::text||'/[0-9]{10,20}[.](jpg|png|webp)$')
 ON CONFLICT(object_path) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION pharmflow_expiry_private.enqueue_receiving_review_photos(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION pharmflow_expiry_private.receiving_review_photo_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
 IF NEW.workflow='RECEIVING' AND NEW.status IN ('RESOLVED','DELETED') THEN
  PERFORM pharmflow_expiry_private.enqueue_receiving_review_photos(NEW.pharmacy_id,NEW.id);
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION pharmflow_expiry_private.receiving_review_photo_lifecycle() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER pharmflow_receiving_review_photo_cleanup AFTER UPDATE OF status,photo_path ON public.pharmflow_needs_review_v2 FOR EACH ROW
 WHEN (NEW.workflow='RECEIVING' AND NEW.status IN ('RESOLVED','DELETED') AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.photo_path IS DISTINCT FROM NEW.photo_path))
 EXECUTE FUNCTION pharmflow_expiry_private.receiving_review_photo_lifecycle();

CREATE FUNCTION pharmflow_expiry_private.guard_receiving_review_photo_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
BEGIN
 IF NEW.workflow<>'RECEIVING' THEN RETURN NEW; END IF;
 IF NEW.photo_path IS NOT NULL AND (TG_OP='INSERT' OR NEW.photo_path IS DISTINCT FROM OLD.photo_path) AND
  NEW.photo_path !~ ('^'||NEW.pharmacy_id::text||'/'||NEW.id::text||'/[0-9]{10,20}[.](jpg|png|webp)$') THEN
  RAISE EXCEPTION 'Receiving photo reference must belong to this review and pharmacy';
 END IF;
 IF NEW.status='PENDING' AND NEW.photo_path IS NOT NULL AND EXISTS(
  SELECT 1 FROM pharmflow_expiry_private.photo_cleanup_jobs j WHERE j.object_path=NEW.photo_path AND j.state IN ('CLAIMED','DONE')) THEN
  RAISE EXCEPTION 'Photo cleanup already fenced; review cannot reference this image';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION pharmflow_expiry_private.guard_receiving_review_photo_reference() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER pharmflow_receiving_review_photo_reference_guard BEFORE INSERT OR UPDATE OF status,photo_path ON public.pharmflow_needs_review_v2 FOR EACH ROW
 EXECUTE FUNCTION pharmflow_expiry_private.guard_receiving_review_photo_reference();

CREATE FUNCTION pharmflow_expiry_private.guard_receiving_storage_photo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE v_path text;v_pharmacy uuid;v_review uuid;r public.pharmflow_needs_review_v2%rowtype;v_actor uuid;v_member boolean;v_sub text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.bucket_id<>'pharmflow-needs-review' OR split_part(OLD.name,'/',2)='expiry-v1' THEN RETURN OLD; END IF;
  v_path:=OLD.name;
 ELSE
  IF TG_OP='UPDATE' AND (OLD.name IS DISTINCT FROM NEW.name OR OLD.bucket_id IS DISTINCT FROM NEW.bucket_id) AND
    (OLD.bucket_id='pharmflow-needs-review' OR NEW.bucket_id='pharmflow-needs-review') THEN
   RAISE EXCEPTION 'Review photos cannot move between scopes';
  END IF;
  IF NEW.bucket_id<>'pharmflow-needs-review' OR split_part(NEW.name,'/',2)='expiry-v1' THEN RETURN NEW; END IF;
  v_path:=NEW.name;
 END IF;
 IF v_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{10,20}[.](jpg|png|webp)$' THEN RAISE EXCEPTION 'Invalid Receiving photo path'; END IF;
 v_pharmacy:=split_part(v_path,'/',1)::uuid;v_review:=split_part(v_path,'/',2)::uuid;
 SELECT * INTO r FROM public.pharmflow_needs_review_v2 WHERE id=v_review AND pharmacy_id=v_pharmacy AND workflow='RECEIVING' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Receiving photo scope denied'; END IF;
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM public.pharmflow_needs_review_v2 a WHERE a.status='PENDING' AND a.photo_path=v_path) THEN RAISE EXCEPTION 'Active review photo is protected'; END IF;
  IF current_setting('role',true)='service_role' AND EXISTS(
   SELECT 1 FROM pharmflow_expiry_private.photo_cleanup_jobs j WHERE j.pharmacy_id=v_pharmacy AND j.review_id=v_review AND j.operation_id IS NULL AND j.object_path=v_path
   AND j.state='CLAIMED' AND j.claim_until>now() AND j.claim_token IS NOT NULL AND
   pharmflow_expiry_private.photo_cleanup_eligible(j.pharmacy_id,j.operation_id,j.review_id,j.object_path,j.cleanup_reason)) THEN RETURN OLD; END IF;
  IF r.status NOT IN ('RESOLVED','DELETED') OR public.is_pharmacy_admin(v_pharmacy) IS NOT TRUE THEN RAISE EXCEPTION 'Terminal Receiving photo deletion authorization required'; END IF;
  RETURN OLD;
 END IF;
 IF r.status<>'PENDING' THEN RAISE EXCEPTION 'Photo uploads require a pending Receiving review'; END IF;
 v_actor:=auth.uid();
 IF v_actor IS NULL AND session_user='supabase_storage_admin' AND current_setting('role',true)='service_role' THEN
  v_actor:=coalesce(NEW.owner_id,NEW.owner::text)::uuid;v_sub:=current_setting('request.jwt.claim.sub',true);
  PERFORM set_config('request.jwt.claim.sub',v_actor::text,true);v_member:=public.is_pharmacy_member(v_pharmacy);
  PERFORM set_config('request.jwt.claim.sub',coalesce(v_sub,''),true);
 ELSE v_member:=public.is_pharmacy_member(v_pharmacy); END IF;
 IF v_actor IS NULL OR v_member IS NOT TRUE OR coalesce(NEW.owner_id,NEW.owner::text) IS DISTINCT FROM v_actor::text THEN RAISE EXCEPTION 'Receiving photo actor denied'; END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION pharmflow_expiry_private.guard_receiving_storage_photo() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER pharmflow_receiving_storage_photo_guard BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW
 EXECUTE FUNCTION pharmflow_expiry_private.guard_receiving_storage_photo();

ALTER TABLE pharmflow_expiry_private.photo_cleanup_jobs DROP CONSTRAINT photo_cleanup_jobs_state_check;
ALTER TABLE pharmflow_expiry_private.photo_cleanup_jobs ADD CONSTRAINT photo_cleanup_jobs_state_check CHECK(state IN ('PENDING','CLAIMED','DONE','FAILED'));
CREATE OR REPLACE FUNCTION pharmflow_expiry_private.claim_photo_cleanup_jobs(p_limit integer DEFAULT 4)
RETURNS TABLE(job_id uuid,pharmacy_id uuid,review_id uuid,operation_id uuid,object_path text,attempts integer,claim_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pharmflow_expiry_private,pg_temp AS $fn$
BEGIN
 IF current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Cleanup worker role required'; END IF;
 RETURN QUERY WITH due AS (
 SELECT j.job_id FROM pharmflow_expiry_private.photo_cleanup_jobs j
 WHERE ((j.state IN ('PENDING','FAILED') AND j.next_attempt_at<=now()) OR (j.state='CLAIMED' AND j.claim_until<=now()))
 AND pharmflow_expiry_private.photo_cleanup_eligible(j.pharmacy_id,j.operation_id,j.review_id,j.object_path,j.cleanup_reason)
 ORDER BY j.next_attempt_at,j.created_at FOR UPDATE SKIP LOCKED LIMIT least(greatest(coalesce(p_limit,4),1),4)
 ), claimed AS (
 UPDATE pharmflow_expiry_private.photo_cleanup_jobs j SET state='CLAIMED',attempts=j.attempts+1,claim_until=now()+interval '3 minutes',claim_token=gen_random_uuid(),last_error_code=NULL
 FROM due WHERE j.job_id=due.job_id RETURNING j.job_id,j.pharmacy_id,j.review_id,j.operation_id,j.object_path,j.attempts,j.claim_token)
 SELECT * FROM claimed;
END $fn$;
CREATE OR REPLACE FUNCTION pharmflow_expiry_private.fail_photo_cleanup_job(p_job_id uuid,p_claim_token uuid,p_error_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pharmflow_expiry_private,pg_temp AS $fn$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Cleanup worker role required';end if;
 update pharmflow_expiry_private.photo_cleanup_jobs set state='FAILED',claim_until=null,claim_token=null,next_attempt_at=now()+make_interval(secs=>least(3600,5*(2^least(attempts,9))::integer)),last_error_code=left(coalesce(nullif(p_error_code,''),'storage_error'),64)
 where job_id=p_job_id and claim_token=p_claim_token and state='CLAIMED' and claim_until>now();
 return found;
end $fn$;

COMMIT;
