const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('proposals/staging/20261010_expiry_needs_review_single_photo_and_resolution.sql');
const deleteMigration=read('proposals/staging/20261010_expiry_needs_review_member_delete.sql');
const cleanupWorker=read('supabase/functions/pharmflow-expiry-photo-cleanup/index.ts');
const cleanupCore=read('supabase/functions/pharmflow-expiry-photo-cleanup/cleanup-core.js');
const client=read('js/needs-review.js');
const ui=read('ui.js');
const operation=read('js/expiry-operation.js');
const evidence=read('js/expiry-evidence.js');
const markup=read('index.html');

test('single-photo contract accepts one uploaded product-slot evidence image and retains legacy pair support',()=>{
 assert.match(migration,/alter column expiry_photo_path drop not null/i);
 assert.match(migration,/v_expiry is not null and v_product=v_expiry/);
 assert.match(migration,/v_expiry is not null and not exists/);
 assert.match(migration,/evidence_photo_path/);
 assert.match(migration,/p_capture->>'expiry_photo_path'/);
 assert.doesNotMatch(migration,/raise exception 'Both photos required'/);
 assert.match(operation,/const legacyTwoPhoto=!!photos\?\.product && !!photos\?\.expiry/);
 assert.match(operation,/One valid review photo is required/);
});

test('case listing, count and read are authenticated pharmacy scoped SECURITY DEFINER RPCs',()=>{
 for(const name of ['list_pharmflow_expiry_reviews_v1','count_pharmflow_expiry_reviews_v1','get_pharmflow_expiry_review_v1']){
  const start=migration.indexOf(`function public.${name}`);assert.notEqual(start,-1,name);
  const body=migration.slice(start,migration.indexOf('$$;',start)+3);
  assert.match(body,/security definer/i,name);assert.match(body,/auth\.uid\(\) is null/i,name);assert.match(body,/is_pharmacy_member\(p_pharmacy_id\)/i,name);
 }
 assert.match(migration,/grant execute on function[\s\S]+ to authenticated/i);
 assert.match(migration,/from public,anon/i);
});

test('mapping uses approved PHASE2C1159 add RPC and resolution has no inventory write path',()=>{
 const source=read('PHASE2C1159_HHP084_GLOBAL_IDENTIFIER_AUTH.sql');
 const approved=source.match(/create or replace function public\.add_pharmflow_global_identifier_v2\([\s\S]*?\nend \$\$;/i)?.[0];
 const proposed=migration.match(/create or replace function public\.add_pharmflow_global_identifier_v2\([\s\S]*?\nend \$\$;/i)?.[0];
 assert.ok(approved&&proposed);
 const expected=approved
  .replace(' v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;',' v_mapping public.pharmflow_global_item_identifiers_v2%rowtype;\n v_audit public.pharmflow_identifier_mapping_audit_v1%rowtype;')
  .replace(' on conflict(operation_id) do nothing;\n return jsonb_build_object',` on conflict(operation_id) do nothing;
 -- PHASE2C1159's signature, authorization, normalized key, mapping write and
 -- audit schema stay canonical. This guard closes its DO NOTHING false-success
 -- case and still permits an exact same-operation retry only.
 select * into v_audit from public.pharmflow_identifier_mapping_audit_v1 where operation_id=p_operation_id for update;
 if not found or v_audit.action is distinct from 'ADD' or v_audit.identifier_id is distinct from v_mapping.id
    or v_audit.identifier_display is distinct from v_mapping.identifier_display or v_audit.identifier_key is distinct from v_mapping.identifier_key
    or v_audit.old_item_code is not null or v_audit.new_item_code is distinct from v_mapping.item_code
    or v_audit.reason is distinct from v_reason or v_audit.performed_by is distinct from auth.uid() then
   raise exception 'Operation ID was already used for a different identifier mapping operation';
 end if;
 return jsonb_build_object`);
 assert.equal(proposed,expected,'PHASE2C1159 body may differ only by the post-insert audit-operation conflict guard');
 assert.match(approved,/on conflict\(operation_id\) do nothing/i); // authoritative-source defect, intentionally guarded after the same audit insert
 const resolve=migration.match(/create or replace function public\.resolve_pharmflow_expiry_review_v1\([\s\S]*?\nend \$\$;/i)?.[0];
 assert.match(resolve,/public\.pharmflow_is_reference_master_admin_v1\(\)/);
 assert.match(resolve,/public\.is_pharmacy_admin\(p_pharmacy_id\)/);
 assert.match(resolve,/public\.add_pharmflow_global_identifier_v2\(/);
 assert.match(resolve,/identifier is already mapped to another item code/i);
 assert.match(resolve,/status='RESOLVED'/);
 assert.match(resolve,/resolution_transaction_id is distinct from p_operation_id::text/i);
 assert.doesNotMatch(resolve,/save_known_core|pharmflow_expiry_current_state_v1|pharmflow_expiry_events_v1/);
});

test('review reads and Storage photo visibility remain member-scoped while resolution requires admin and reference-master authority',()=>{
 const preflight=migration.slice(0,migration.indexOf('end $$;'));
 assert.match(preflight,/review read policy must remain authenticated and pharmacy-member scoped/i);
 assert.match(preflight,/private photo reads must remain authenticated, bucket-specific, and pharmacy-member scoped/i);
 for(const name of ['get_pharmflow_expiry_review_v1','list_pharmflow_expiry_reviews_v1','count_pharmflow_expiry_reviews_v1']){
  const body=migration.match(new RegExp(`function public\\.${name}\\([\\s\\S]*?\\nend \\$\\$;`,'i'))?.[0];
  assert.ok(body,name);assert.match(body,/auth\.uid\(\) is null/i);assert.match(body,/is_pharmacy_member\(p_pharmacy_id\)/i);
 }
 const resolve=migration.match(/function public\.resolve_pharmflow_expiry_review_v1\([\s\S]*?\nend \$\$;/i)?.[0];
 assert.match(resolve,/is_pharmacy_admin\(p_pharmacy_id\)/i);assert.match(resolve,/pharmflow_is_reference_master_admin_v1\(\)/i);
 assert.doesNotMatch(migration,/create\s+policy|drop\s+policy/i);
});

test('preflight checks constraint structure and live photo references without exact formatted-FK SQL comparisons',()=>{
 const preflight=migration.slice(0,migration.indexOf('end $$;'));
 assert.match(preflight,/c\.confrelid='pharmflow_expiry_private\.photos'::regclass/i);
 assert.match(preflight,/c\.conkey[\s\S]*attname/i);
 assert.match(preflight,/regexp_replace\(lower\(pg_get_expr\(c\.conbin,c\.conrelid\)\)/i);
 assert.match(preflight,/Existing Expiry review\/photo references are incomplete or cross-pharmacy/i);
 assert.doesNotMatch(preflight,/pg_get_constraintdef\(oid\)\s*=/i);
});

test('submission waits for verified migration contract and uses one Take Photo control',()=>{
 assert.match(client,/get_pharmflow_expiry_review_contract_v1/);
 assert.match(client,/count_pharmflow_expiry_reviews_v1/);
 assert.match(client,/list_pharmflow_expiry_reviews_v1/);
 assert.match(client,/resolve_pharmflow_expiry_review_v1/);
 assert.match(evidence,/!ready\?'Needs Review submission is unavailable/);
 assert.match(evidence,/SUBMIT FOR REVIEW/);
 assert.equal((markup.match(/id="btnExpiryPhoto"/g)||[]).length,1);
 assert.doesNotMatch(markup,/btnExpiryRetake(Product|Expiry)/);
 assert.match(ui,/IdentifierService\.searchItems\(query,8\)/);
 assert.match(ui,/Copy Barcode/);
});

test('pending-only operational review UI keeps the authorized Global Master and delete actions',()=>{
 const rpc=deleteMigration.match(/create function public\.delete_pharmflow_expiry_review_v1\([\s\S]*?\nend \$\$;/i)?.[0];
 assert.ok(rpc);assert.match(rpc,/security definer/i);assert.match(rpc,/auth\.uid\(\) is null/i);assert.match(rpc,/is_pharmacy_member\(p_pharmacy_id\)/i);
 assert.match(rpc,/workflow='EXPIRY'/i);assert.match(rpc,/status='DELETED'/i);assert.match(rpc,/status<>'PENDING'/i);assert.match(rpc,/for update/i);
 assert.doesNotMatch(deleteMigration,/delete\s+from\s+(?:public\.)?pharmflow_needs_review_v2/i);
 assert.doesNotMatch(rpc,/global_item|expiry_current_state|expiry_events|needs_review_photo/i);
 assert.match(client,/delete_pharmflow_expiry_review_v1/);assert.match(client,/separately approved Staging migration/);assert.match(client,/p_status:'PENDING'/);
 assert.match(client,/refreshAfterTerminal/);assert.match(client,/expiryNeedsReviewCount/);
 assert.match(ui,/data-review-delete/);assert.match(ui,/window\.confirm\('Delete this pending Expiry review case/);
 assert.match(ui,/expiryGlobalMasterSummary/);const panel=ui.slice(ui.indexOf('async function openExpiryNeedsReviewPanel'),ui.indexOf('window.refreshNeedsReviewCounters'));
 assert.doesNotMatch(panel,/nrV2ItemSummary/);assert.match(panel,/Only approved Global Master writers/);
 assert.doesNotMatch(panel,/History|Resolved|Deleted/);assert.match(panel,/Pending review/);
 assert.match(ui,/expanded!==null&&expanded!==index/);assert.match(ui,/Private evidence photo could not be loaded/);
 assert.match(panel,/if\(open\)loadEvidencePhoto\(\)/);assert.match(panel,/Open details to load evidence photo/);
 assert.match(deleteMigration,/add column deleted_by uuid references auth\.users/i);assert.match(deleteMigration,/add column deleted_at timestamptz/i);
 assert.match(deleteMigration,/photo_cleanup_jobs/);assert.match(deleteMigration,/after update of status/i);assert.match(deleteMigration,/current_setting\('role',true\)='service_role'/i);
 assert.match(cleanupWorker,/storage\/v1\/object/);assert.match(cleanupWorker,/STORAGE_BUCKET = "pharmflow-needs-review"/);assert.match(cleanupWorker,/complete_photo_cleanup_job/);assert.match(cleanupWorker,/fail_photo_cleanup_job/);
 assert.match(cleanupWorker,/EXPIRY_CLEANUP_CRON_TOKEN/);assert.match(deleteMigration,/pg_cron and pg_net/i);
 assert.match(deleteMigration,/cron\.schedule/);assert.match(deleteMigration,/vault\.decrypted_secrets/);
 assert.doesNotMatch(client,/functions\/v1\/pharmflow-expiry-photo-cleanup/);
});

test('cleanup outbox covers all operation photos and service deletion remains exact-path scoped',()=>{
 const enqueue=deleteMigration.match(/create function pharmflow_expiry_private\.enqueue_review_photo_cleanup\([\s\S]*?\nend \$\$;/i)?.[0];
 assert.ok(enqueue);
 assert.match(enqueue,/join pharmflow_expiry_private\.photos p on p\.pharmacy_id=d\.pharmacy_id and p\.operation_id=d\.operation_id/i);
 assert.doesNotMatch(enqueue,/p\.path in \(d\.product_photo_path,d\.expiry_photo_path\)/i);
 assert.match(enqueue,/o\.status='COMMITTED'/i);
 assert.match(enqueue,/old\.status='PENDING' and new\.status in \('RESOLVED','DELETED'\)/i);
 assert.match(deleteMigration,/claim_token uuid/i);
 assert.match(deleteMigration,/claim_token=gen_random_uuid\(\)/i);
 assert.match(deleteMigration,/p_claim_token uuid/i);
 assert.match(deleteMigration,/claim_token=p_claim_token and state='CLAIMED' and claim_until>now\(\)/i);
 assert.match(deleteMigration,/p\.path=j\.object_path and p\.pharmacy_id=j\.pharmacy_id and p\.operation_id=j\.operation_id/i);
});

test('worker claims are fenced, timed, bounded, and partial failure is not reported as success',()=>{
 assert.match(cleanupWorker,/fetchWithTimeout/);
 assert.match(cleanupCore,/AbortSignal\.timeout\(timeoutMs\)/);
 assert.match(cleanupCore,/REQUEST_TIMEOUT_MS = 10_000/);
 assert.match(cleanupCore,/MAX_BATCH = 4/);
 assert.match(cleanupWorker,/p_claim_token: job\.claim_token/);
 assert.match(cleanupCore,/validCleanupJob\(job\)/);
 assert.match(cleanupWorker,/status: result\.success \? 200 : 503/);
 assert.match(cleanupCore,/deferred/);
 assert.match(cleanupCore,/response\.status === 404/);
 assert.match(cleanupCore,/success: failed === 0 && claimLost === 0 && deferred === 0/);
 assert.match(deleteMigration,/state='CLAIMED',[\s\S]*?claim_until=now\(\)\+interval '3 minutes'/i);
 assert.match(deleteMigration,/least\(greatest\(coalesce\(p_limit,4\),1\),4\)/i);
 assert.match(deleteMigration,/oldest_outstanding_age/);
 assert.match(deleteMigration,/HTTP 200 does not prove all/i);
});

