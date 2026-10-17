-- Staging-only compatibility wrappers for the deployed cleanup worker.
-- The worker uses PostgREST's default public schema. Keep implementation,
-- authorization, leasing, and pharmacy scoping in the private RPC functions.

create function public.claim_photo_cleanup_jobs(p_limit integer default 4)
returns table (
  job_id uuid,
  pharmacy_id uuid,
  review_id uuid,
  operation_id uuid,
  object_path text,
  attempts integer,
  claim_token uuid
)
language sql
security invoker
set search_path = pg_catalog, public, pg_temp
as $wrapper$
  select c.job_id, c.pharmacy_id, c.review_id, c.operation_id,
         c.object_path, c.attempts, c.claim_token
  from pharmflow_expiry_private.claim_photo_cleanup_jobs(p_limit) as c;
$wrapper$;

create function public.complete_photo_cleanup_job(
  p_job_id uuid,
  p_object_path text,
  p_claim_token uuid
)
returns boolean
language sql
security invoker
set search_path = pg_catalog, public, pg_temp
as $wrapper$
  select pharmflow_expiry_private.complete_photo_cleanup_job(
    p_job_id, p_object_path, p_claim_token
  );
$wrapper$;

create function public.fail_photo_cleanup_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text
)
returns boolean
language sql
security invoker
set search_path = pg_catalog, public, pg_temp
as $wrapper$
  select pharmflow_expiry_private.fail_photo_cleanup_job(
    p_job_id, p_claim_token, p_error_code
  );
$wrapper$;

revoke all on function public.claim_photo_cleanup_jobs(integer)
  from public, anon, authenticated;
revoke all on function public.complete_photo_cleanup_job(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_photo_cleanup_job(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.claim_photo_cleanup_jobs(integer) to service_role;
grant execute on function public.complete_photo_cleanup_job(uuid, text, uuid) to service_role;
grant execute on function public.fail_photo_cleanup_job(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
