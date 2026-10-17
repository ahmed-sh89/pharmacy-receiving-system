# Synthetic-only real staging integration runner. Requires staging fixtures and test probe.
# Never point at Production. Credentials are environment-only and are not recorded.
import sys,os,json,pathlib,urllib.request,urllib.error,uuid,time,concurrent.futures,base64,struct,zlib
DIR=pathlib.Path(__file__).parent
CFG={'url':os.environ['PHARMFLOW_STAGING_URL'],'apikey':os.environ['PHARMFLOW_STAGING_API_KEY'],'password':os.environ['PHARMFLOW_STAGING_SYNTHETIC_PASSWORD']}
assert CFG['url']=='https://tovkcakucyagvbzvlnks.supabase.co','ONLY verified staging target permitted'
PA='11111111-1111-4111-8111-111111111111';PB='22222222-2222-4222-8222-222222222222'
UA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';AD='cccccccc-cccc-4ccc-8ccc-cccccccccccc';W='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';WB='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
TOKENS={};RESULTS=[];OPS={};B='pharmflow-needs-review'
def request(method,path,user='a',data=None,headers=None,binary=False):
 h={'apikey':CFG['apikey']};h.update(headers or {})
 if user is not None:h['Authorization']='Bearer '+TOKENS[user]
 body=data if isinstance(data,bytes) else json.dumps(data).encode() if data is not None else None
 if body is not None and not isinstance(data,bytes):h['Content-Type']='application/json'
 req=urllib.request.Request(CFG['url']+path,data=body,headers=h,method=method)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:status,raw=r.status,r.read()
 except urllib.error.HTTPError as e:status,raw=e.code,e.read()
 if binary:return status,raw
 try:return status,json.loads(raw) if raw else None
 except ValueError:return status,raw.decode(errors='replace')[:400]
def rpc(name,args,user='a',ok=True):
 status,data=request('POST','/rest/v1/rpc/'+name,user,args)
 if ok:assert status==200,(name,status,data)
 else:assert status>=400,(name,'unexpected success',data)
 return data

def login():
 for role in ['a','b','admin','owner','outsider']:
  status,r=request('POST','/auth/v1/token?grant_type=password',None,{'email':'pharmflow-staging-'+role+'@example.invalid','password':CFG['password']})
  assert status==200 and r.get('access_token'),('synthetic login',role,status)
  TOKENS[role]=r['access_token']
def run(name,fn):
 started=time.time()
 try:
  evidence=fn();record={'test':name,'result':'PASS','seconds':round(time.time()-started,2),'evidence':evidence}
 except Exception as e:record={'test':name,'result':'FAIL','seconds':round(time.time()-started,2),'error':str(e)[:1200]}
 RESULTS.append(record);(DIR/'staging-test-evidence.json').write_text(json.dumps(RESULTS,indent=2));print(json.dumps(record),flush=True)
def uid():return str(uuid.uuid4())
def payload(identifier='U0030',kind='KNOWN'):
 return {'kind':kind,'identifier_display':identifier,'raw_scan':identifier,'scan_format':'PLAIN','quantity':3,'expiry_month':8,'expiry_year':2028,'worker_id':W,'device_id':'synthetic-staging-device','source':'HANDHELD','batch_no':None,'sample_serial':None,'item_code':'SYNTHETIC-'+identifier,'item_name':'Synthetic '+identifier,'category':'Medicine'}
def save(p,op=None,pharmacy=PA,user='a',ok=True):
 op=op or uid();OPS[op]={'pharmacy':pharmacy,'payload':p}
 return op,rpc('save_pharmflow_expiry_capture_v3',{'p_pharmacy_id':pharmacy,'p_operation_id':op,'p_capture':p},user,ok)
def reconcile(op,pharmacy=PA,user='a'):
 return rpc('get_pharmflow_expiry_capture_operation_v1',{'p_pharmacy_id':pharmacy,'p_operation_id':op},user)
def png(rgb):
 def chunk(t,d):return struct.pack('!I',len(d))+t+d+struct.pack('!I',zlib.crc32(t+d)&0xffffffff)
 return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',2,2,8,2,0,0,0))+chunk(b'IDAT',zlib.compress((b'\x00'+bytes(rgb)*2)*2))+chunk(b'IEND',b'')
PRODUCT=png([220,30,30]);EXPIRY=png([30,30,220])
def reserve(op):return rpc('reserve_pharmflow_expiry_capture_v1',{'p_pharmacy_id':PA,'p_operation_id':op})
def path(op,role):return PA+'/expiry-v1/'+op+'/'+role+'/'+uid()+'.png'
def upload(path,data,user='a',upsert=False):return request('POST','/storage/v1/object/'+B+'/'+path,user,data,{'Content-Type':'image/png','x-upsert':str(upsert).lower()})
def download(path,user='a'):return request('GET','/storage/v1/object/authenticated/'+B+'/'+path,user,headers={'Cache-Control':'no-cache'},binary=True)
def delete(path,user='a'):return request('DELETE','/storage/v1/object/'+B,user,{'prefixes':[path]})
def evidence(op=None):
 op=op or uid();reserve(op);p=payload('PHOTO-'+op[:8],'UNKNOWN');paths={}
 for role,data in [('product',PRODUCT),('expiry',EXPIRY)]:
  paths[role]=path(op,role);status,r=upload(paths[role],data);assert status in [200,201],('upload',role,status,r);p[role+'_photo_path']=paths[role]
 return op,p,paths

def exact_ids():
 rows=[]
 for ident in ['U0030','S00110','1234A','001234','04065272072977']:
  p=payload(ident);p['raw_scan']=' ]C0'+ident+'\r\n';op,r=save(p);assert r['operation_id']==op and r['state_id'] and r['event_id'];rows.append({'identifier':ident,'operation_id':op,'acknowledged':True})
 return rows

def concurrency(duplicate=True):
 p=payload('CONCURRENT-'+uid()[:8]);op=uid();ids=[op,op] if duplicate else [uid(),uid()]
 def call(i):return rpc('pharmflow_expiry_staging_probe_v1',{'p_pharmacy_id':PA,'p_operation_id':i,'p_capture':p,'p_delay':1})
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:rows=list(pool.map(call,ids))
 assert rows[0]['backend_pid']!=rows[1]['backend_pid'],('independent backend PIDs required',rows)
 assert max(r['started'] for r in rows)<min(r['finished'] for r in rows),('transactions did not overlap',rows)
 if duplicate:assert rows[0]['ack']==rows[1]['ack']
 else:assert rows[0]['ack']['event_id']!=rows[1]['ack']['event_id'] and rows[0]['ack']['state_id']==rows[1]['ack']['state_id']
 for i in ids:OPS[i]={'pharmacy':PA,'payload':p}
 status,state=request('GET','/rest/v1/pharmflow_expiry_current_state_v1?id=eq.'+rows[0]['ack']['state_id']+'&select=verified_quantity');assert status==200 and state[0]['verified_quantity']==(3 if duplicate else 6),(status,state)
 return {'backend_pids':[r['backend_pid'] for r in rows],'overlap':True,'quantity':state[0]['verified_quantity'],'operation_ids':ids}
def retries():
 p=payload('UNCERTAIN-'+uid()[:8]);op,r=save(p);assert reconcile(op)==r
 # Deliberately ignore the first acknowledged response, then resend the same frozen payload.
 _,again=save(p,op);assert again==r
 save({**p,'quantity':4},op,ok=False)
 rpc('save_pharmflow_expiry_capture_v3',{'p_pharmacy_id':PA,'p_operation_id':op,'p_capture':p},'admin',False)
 assert reconcile(op,user='admin') is None
 return {'operation_id':op,'same_ack':True,'changed_payload_denied':True,'other_owner_denied':True}
def rollback():
 p=payload('ROLLBACK-'+uid()[:8]);op=uid();r=rpc('pharmflow_expiry_staging_probe_v1',{'p_pharmacy_id':PA,'p_operation_id':op,'p_capture':p,'p_rollback':True},ok=False)
 assert 'Synthetic rollback' in json.dumps(r);assert reconcile(op) is None
 status,rows=request('GET','/rest/v1/pharmflow_expiry_current_state_v1?item_code=eq.'+p['item_code']+'&select=id');assert status==200 and rows==[]
 return {'operation_id':op,'rolled_back_operation_and_quantity':True}
def authz():
 p=payload('AUTH-'+uid()[:8]);save(p,pharmacy=PA,user='b',ok=False);save(p,pharmacy=PA,user='outsider',ok=False)
 rpc('save_pharmflow_expiry_capture_v3',{'p_pharmacy_id':PA,'p_operation_id':uid(),'p_capture':p},None,False)
 save({**p,'worker_id':WB},ok=False);save({**p,'worker_id':None},ok=False)
 status,rows=request('GET','/rest/v1/pharmflow_expiry_current_state_v1?pharmacy_id=eq.'+PA+'&select=id','b');assert status==200 and rows==[],('RLS leaked',status,rows)
 owner=[]
 for ph,worker in [(PA,W),(PB,WB)]:
  op,r=save({**payload('OWNER-'+uid()[:8]),'worker_id':worker},pharmacy=ph,user='owner');owner.append({'pharmacy':ph,'operation_id':op,'ack':bool(r.get('event_id'))})
 return {'cross_pharmacy_denied':True,'outsider_denied':True,'anonymous_denied':True,'wrong_worker_denied':True,'System_Owner_authorized':owner,'HHP084_member_capture':True}
def required():
 for key in ['raw_scan','quantity','expiry_month','expiry_year','worker_id','device_id','batch_no','sample_serial']:
  p=payload('MISSING-'+key);del p[key];save(p,ok=False)
 save({**payload('UNKNOWN-NO-PHOTOS','UNKNOWN')},ok=False)
 for p in [{**payload(),'quantity':0},{**payload(),'identifier_display':'LOSS'},{**payload(),'device_id':''}]:save(p,ok=False)
 return {'missing_complete_fields_denied':True,'missing_photos_denied':True}

def photo_lifecycle():
 op,p,paths=evidence();OPS['photo_case']={'operation_id':op,'payload':p,'paths':paths}
 for role,data in [('product',PRODUCT),('expiry',EXPIRY)]:
  status,body=download(paths[role]);assert status==200 and body==data,('binary read',role,status)
  status,_=download(paths[role],'b');assert status>=400,('cross-tenant read',status)
  status,_=upload(paths[role],png([1,2,3]),upsert=True);assert status>=400,('replacement succeeded',status)
  status,body=download(paths[role]);assert status==200 and body==data
 _,r=save(p,op);OPS['photo_case']['review_id']=r['review_id']
 row=rpc('get_pharmflow_expiry_review_v1',{'p_pharmacy_id':PA,'p_review_id':r['review_id']})
 for key,val in p.items():assert row[key]==val,('capture field mismatch',key)
 for role,data in [('product',PRODUCT),('expiry',EXPIRY)]:
  delete(paths[role]);status,body=download(paths[role]);assert status==200 and body==data,('captured photo deleted')
  delete(paths[role],'admin');status,body=download(paths[role]);assert status==200 and body==data,('admin bypassed cleanup')
 rpc('authorize_pharmflow_expiry_photo_cleanup_v1',{'p_pharmacy_id':PA,'p_review_id':r['review_id']},'admin',False)
 args={'p_pharmacy_id':PA,'p_review_id':r['review_id'],'p_item_code':'SYNTHETIC-RESOLVED','p_item_name':'Synthetic resolved','p_resolution_type':'ADD_UNORDERED','p_resolution_transaction_id':None}
 rpc('resolve_pharmflow_needs_review_v2',args,'a',False)
 assert rpc('resolve_pharmflow_needs_review_v2',args,'admin') is True
 rpc('authorize_pharmflow_expiry_photo_cleanup_v1',{'p_pharmacy_id':PA,'p_review_id':r['review_id']},'a',False)
 permit=rpc('authorize_pharmflow_expiry_photo_cleanup_v1',{'p_pharmacy_id':PA,'p_review_id':r['review_id']},'admin');assert set(permit['paths'])==set(paths.values())
 for path_ in permit['paths']:
  status,res=delete(path_,'admin');assert status==200,('cleanup',status,res)
  status,_=download(path_);assert status>=400,('binary survived cleanup',status)
 row=rpc('get_pharmflow_expiry_review_v1',{'p_pharmacy_id':PA,'p_review_id':r['review_id']});assert row['product_photo_deleted'] and row['expiry_photo_deleted'] and row['raw_scan']==p['raw_scan'] and row['status']=='RESOLVED'
 return {'operation_id':op,'review_id':r['review_id'],'two_binary_uploads_reads':True,'replacement_deletion_denied':True,'authorized_binary_cleanup':True,'audit_retained':True}
def gs1():
 op,p,paths=evidence();p.update(identifier_display='04065272072977',raw_scan=']C101040652720729771728080010LOT-A\x1d21SERIAL-1',scan_format='GS1',batch_no='LOT-A',sample_serial='SERIAL-1')
 _,r=save(p,op);row=rpc('get_pharmflow_expiry_review_v1',{'p_pharmacy_id':PA,'p_review_id':r['review_id']})
 assert all(row[k]==v for k,v in p.items())
 save({**p,'quantity':4},op,ok=False)
 return {'operation_id':op,'review_id':r['review_id'],'GTIN_lot_serial_day00_exact':True}
def legacy():
 args={'p_pharmacy_id':PA,'p_item_code':'SYNTHETIC-LEGACY','p_item_name':'Synthetic legacy','p_gtin':'001234','p_category':'Medicine','p_quantity':1,'p_expiry_month':8,'p_expiry_year':2028,'p_worker_id':W}
 for name in ['save_pharmacy_expiry_capture','save_pharmacy_expiry_capture_smart']:rpc(name,args,ok=False)
 args['p_identifier_display']=args.pop('p_gtin')
 for name in ['save_pharmacy_expiry_verified_state_v1','save_pharmacy_expiry_verified_state_v2']:rpc(name,args,ok=False)
 rpc('save_pharmacy_needs_review',{'p_pharmacy_id':PA,'p_workflow':'EXPIRY','p_gtin':'001234','p_review_reason':'UNKNOWN_GTIN'},ok=False)
 rpc('create_pharmflow_needs_review_v3',{'p_pharmacy_id':PA,'p_workflow':'EXPIRY','p_identifier_display':'001234'},ok=False)
 _,r=save(payload('NEW-AFTER-LEGACY-'+uid()[:8]));return {'all_old_Expiry_paths_denied':True,'new_path_ack':bool(r['event_id'])}
def receiving():
 r=rpc('create_pharmflow_needs_review_v3',{'p_pharmacy_id':PA,'p_workflow':'RECEIVING','p_identifier_display':'S00110','p_raw_barcode':'S00110','p_session_id':'synthetic-session','p_order_number':'SYNTHETIC-ORDER','p_order_name':'Synthetic receiving','p_device_id':'synthetic-device'})
 row=r[0] if isinstance(r,list) else r;review=row.get('review_id') or row.get('id');assert review,('Receiving ack',r)
 legacy_path=PA+'/'+review+'/'+uid()+'.png';status,resp=upload(legacy_path,PRODUCT);assert status in [200,201],(status,resp)
 rpc('set_pharmflow_needs_review_photo_v2',{'p_pharmacy_id':PA,'p_review_id':review,'p_photo_path':legacy_path})
 status,_=upload(legacy_path,EXPIRY,upsert=True);assert status in [200,201],('Receiving replacement changed',status)
 status,body=download(legacy_path);assert status==200 and body==EXPIRY
 status,res=delete(legacy_path,'admin');assert status==200,(status,res)
 return {'Receiving_V3_review_id':review,'identifier_preserved':True,'legacy_media_upload_replace_cleanup_unchanged':True}
if __name__=='__main__':
 login();print(json.dumps({'verified_target':CFG['url'],'synthetic_logins':len(TOKENS)}),flush=True)
 for name,fn in [('Exact known scan identities',exact_ids),('Native independent-connection duplicate operation',lambda:concurrency(True)),('Native independent-connection additive saves',lambda:concurrency(False)),('Lost-response reconciliation and payload/owner conflict',retries),('Transaction rollback after successful internal save',rollback),('Actual RLS, workers, HHP084 membership and System Owner',authz),('Complete required data and missing photos',required),('Actual Storage upload/read/protection/finalization/cleanup',photo_lifecycle),('GS1 exact fields and both actual photos',gs1),('Legacy/new capture compatibility',legacy),('Receiving V3 and existing Storage paths',receiving)]:run(name,fn)
 (DIR/'synthetic-operations.json').write_text(json.dumps(OPS,indent=2))
 print(json.dumps({'pass':sum(r['result']=='PASS' for r in RESULTS),'fail':sum(r['result']=='FAIL' for r in RESULTS)}),flush=True)

 if any(r["result"]!="PASS" for r in RESULTS):sys.exit(1)
