"""Build review-only migration; preserve deployed legacy bodies except Expiry capture guards."""
import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[2]
defs=json.loads((root/'tests/expiry-backend/deployed-save-contracts.json').read_text())
parts=['-- REVIEW ONLY: NOT APPLIED. Requires coordinated Expiry client cutover.\nbegin;\n-- Reserved namespace must be unused; never repurpose existing media.\ndo $$begin if not exists(select 1 from storage.buckets where id=\'pharmflow-needs-review\' and public=false) then raise exception \'Private review bucket required\';end if;end$$;\ndo $$begin if exists(select 1 from storage.objects where bucket_id=\'pharmflow-needs-review\' and split_part(name,\'/\',2)=\'expiry-v1\') then raise exception \'Reserved Expiry media namespace already exists\';end if;end$$;\ncreate schema pharmflow_expiry_private;\nrevoke all on schema pharmflow_expiry_private from public,anon,authenticated;\n']
for d in defs:
 s=d['definition'];name=d['proname']
 if name=='save_pharmacy_expiry_verified_state_v2':
  core=s.replace('public.'+name,'pharmflow_expiry_private.save_known_core',1)
  parts.append(core+';\nrevoke all on function pharmflow_expiry_private.save_known_core(uuid,text,text,text,text,integer,integer,integer,uuid,text,text,text,text,text) from public,anon,authenticated;\n')
 guard="if upper(btrim(coalesce(p_workflow,'')))='EXPIRY' then raise exception 'Expiry capture requires operation-aware V3';end if;" if name=='save_pharmacy_needs_review' else ("if upper(btrim(coalesce(p_event_type,'CAPTURE')))='CAPTURE' then raise exception 'Expiry capture requires operation-aware V3';end if;" if 'verified_state' in name else "raise exception 'Expiry capture requires operation-aware V3';")
 s=re.sub(r'\bbegin\b',lambda m:m.group(0)+'\n '+guard,s,count=1,flags=re.I)
 parts.append(s+';\n')
parts.append((root/'tests/expiry-backend/integrity-contract.sql').read_text())
parts.append('\ncommit;\n')
(root/'proposals/expiry-backend/20261008004855_expiry_capture_integrity_final.sql').write_text('\n'.join(parts))
