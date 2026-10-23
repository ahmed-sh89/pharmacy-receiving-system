(() => {
  const passwordModal=document.getElementById('passwordModal');
  const ownerEdit=document.getElementById('ownerEdit');
  const statusButton=document.getElementById('statusButton');
  const statusPopover=document.getElementById('statusPopover');
  const toast=document.getElementById('toast');
  const accountButton=document.getElementById('btnAccountModalOpen');
  let toastTimer;
  const showToast=message=>{toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},2600);};
  const closeDialog=dialog=>{dialog.hidden=true;accountButton.focus();};
  document.getElementById('editPharmacy').addEventListener('click',()=>{ownerEdit.hidden=false;ownerEdit.querySelector('[role="dialog"]').focus();});
  ownerEdit.querySelectorAll('[data-edit-cancel]').forEach(button=>button.addEventListener('click',()=>closeDialog(ownerEdit)));
  ownerEdit.querySelector('[data-demo-save]').addEventListener('click',()=>showToast('Visual demo only · changes are not saved'));
  document.getElementById('changePassword').addEventListener('click',()=>{passwordModal.hidden=false;passwordModal.querySelector('[role="dialog"]').focus();});
  passwordModal.querySelectorAll('[data-password-close]').forEach(button=>button.addEventListener('click',()=>closeDialog(passwordModal)));
  document.getElementById('btnLogout').addEventListener('click',()=>showToast('Visual demo only · sign out is disabled'));
  document.querySelectorAll('[data-demo-action]').forEach(button=>button.addEventListener('click',()=>showToast('Visual demo only · operational actions are disabled')));
  statusButton.addEventListener('click',()=>{statusPopover.hidden=!statusPopover.hidden;statusButton.setAttribute('aria-expanded',String(!statusPopover.hidden));});
  document.addEventListener('click',event=>{
    if(!statusPopover.hidden&&!statusButton.contains(event.target)&&!statusPopover.contains(event.target)){statusPopover.hidden=true;statusButton.setAttribute('aria-expanded','false');}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      if(!passwordModal.hidden){closeDialog(passwordModal);return;}
      if(!ownerEdit.hidden){closeDialog(ownerEdit);return;}
      statusPopover.hidden=true;statusButton.setAttribute('aria-expanded','false');
    }
    if(event.key==='Tab'){
      const dialog=!passwordModal.hidden?passwordModal:(!ownerEdit.hidden?ownerEdit:null);
      if(!dialog)return;
      const nodes=[...dialog.querySelectorAll('button,input')].filter(el=>!el.disabled);const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
})();
document.querySelectorAll('[data-demo-page]').forEach(button=>button.addEventListener('click',()=>{
  document.getElementById('pageTitle').textContent=button.dataset.demoPage;
  document.querySelectorAll('[data-demo-page]').forEach(item=>item.classList.toggle('active',item===button));
}));
