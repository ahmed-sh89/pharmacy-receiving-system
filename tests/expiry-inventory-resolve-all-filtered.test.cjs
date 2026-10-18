const test=require('node:test'),assert=require('node:assert/strict'),{harness}=require('./expiry-desktop-harness.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function openAllFiltered(h){
  await h.click('btnOpenExpiryInventory');
  h.e('expirySelect').onclick();
  h.e('expiryBulkMenu').onclick();
  h.e('expiryAll').onclick();
  await tick();
  assert.match(h.document.querySelector('dialog').textContent,/All filtered results across every page/);
  await h.submit();
  await tick();
  assert.match(h.document.querySelector('dialog').textContent,/Final Resolve Confirmation/);
}

test('Resolve All Filtered confirms every server-matched row across pagination and requires RESOLVE',async()=>{
  const h=harness(),base=h.c.authRpc,calls=[];
  h.c.authRpc=async(name,p)=>{
    if(name==='resolve_all_filtered_pharmflow_expiry_inventory_v1'){
      calls.push({name,p:structuredClone(p)});
      return {request_id:p.p_request_id,count:p.p_expected_count,action:'RESOLVE'};
    }
    return base(name,p);
  };
  await openAllFiltered(h);
  const dialog=h.document.querySelector('dialog'),button=dialog.querySelector('[type=submit]');
  assert.equal(button.classList.contains('danger'),true);
  assert.match(button.textContent,/Resolve 73 Filtered/);
  assert.equal(dialog.querySelector('#expiryResolvePhrase').value,'');
  dialog.querySelector('#expiryResolvePhrase').value='resolve';
  await h.submit();
  assert.equal(calls.length,0);
  assert.match(dialog.querySelector('[role=alert]').textContent,/Type RESOLVE/);
  dialog.querySelector('#expiryResolvePhrase').value='RESOLVE';
  await h.submit();
  assert.equal(calls.length,1);
  assert.equal(calls[0].p.p_expected_count,73);
  assert.equal(calls[0].p.p_expected_units,2628);
  assert.equal(calls[0].p.p_selection.length,73);
  assert.equal(calls[0].p.p_filters.search,'');
  assert.equal(calls[0].p.p_pharmacy_id,'pharmacy1');
  assert.equal(h.data.length,73);
});

test('A stale filtered scope is rejected and disables execution for that review',async()=>{
  const h=harness(),base=h.c.authRpc;let calls=0;
  h.c.authRpc=async(name,p)=>{
    if(name==='resolve_all_filtered_pharmflow_expiry_inventory_v1'){
      calls++;
      throw Object.assign(Error('Filtered inventory changed; refresh and confirm again'),{serverRejected:true});
    }
    return base(name,p);
  };
  await openAllFiltered(h);
  const dialog=h.document.querySelector('dialog');
  dialog.querySelector('#expiryResolvePhrase').value='RESOLVE';
  await h.submit();
  assert.equal(calls,1);
  assert.match(dialog.querySelector('[role=alert]').textContent,/Filtered inventory changed/);
  assert.equal(dialog.querySelector('[type=submit]').disabled,true);
  assert.equal(h.storage.size,0);
  assert.equal(h.data.length,73);
});

test('Resolve Selected and individual Resolve retain the existing explicit-selection RPC',async()=>{
  for(const mode of ['selected','individual']){
    const h=harness(),base=h.c.authRpc,mutations=[];
    h.c.authRpc=async(name,p)=>{
      if(name==='mutate_pharmflow_expiry_inventory_v1')mutations.push(structuredClone(p));
      return base(name,p);
    };
    await h.click('btnOpenExpiryInventory');
    if(mode==='selected'){
      h.e('expirySelect').onclick();
      const row=h.document.querySelector('[data-row-selection]');
      row.checked=true;row.onchange();
      h.e('expiryBulkAction').onclick({target:h.e('expiryBulkAction')});
    }else h.document.querySelector('[data-row-resolve]').onclick();
    await tick();
    await h.submit();
    await h.submit();
    assert.equal(mutations.length,1,mode);
    assert.equal(mutations[0].p_action,'RESOLVE',mode);
    assert.equal(mutations[0].p_selection.length,1,mode);
  }
});
