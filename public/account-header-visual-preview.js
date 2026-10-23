(() => {
  const accountModal=document.getElementById('accountModal');
  const passwordModal=document.getElementById('passwordModal');
  const ownerEdit=document.getElementById('ownerEdit');
  const statusButton=document.getElementById('statusButton');
  const statusPopover=document.getElementById('statusPopover');
  const toast=document.getElementById('toast');
  let toastTimer;

  const showToast=(message)=>{
    toast.textContent=message;
    toast.hidden=false;
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{toast.hidden=true;},2600);
  };
  const closeAccount=()=>{accountModal.hidden=true;ownerEdit.hidden=true;};
  document.getElementById('accountOpen').addEventListener('click',()=>{accountModal.hidden=false;accountModal.querySelector('[role="dialog"]').focus();});
  accountModal.querySelectorAll('[data-close]').forEach(el=>el.addEventListener('click',closeAccount));
  document.getElementById('editPharmacy').addEventListener('click',()=>{ownerEdit.hidden=false;});
  ownerEdit.querySelector('[data-edit-cancel]').addEventListener('click',()=>{ownerEdit.hidden=true;});
  ownerEdit.querySelector('[data-demo-save]').addEventListener('click',()=>showToast('Visual demo only · changes are not saved'));
  document.getElementById('changePassword').addEventListener('click',()=>{passwordModal.hidden=false;passwordModal.querySelector('[role="dialog"]').focus();});
  passwordModal.querySelectorAll('[data-password-close]').forEach(el=>el.addEventListener('click',()=>{passwordModal.hidden=true;}));
  document.getElementById('signOut').addEventListener('click',()=>showToast('Visual demo only · sign out is disabled'));
  statusButton.addEventListener('click',()=>{statusPopover.hidden=!statusPopover.hidden;statusButton.setAttribute('aria-expanded',String(!statusPopover.hidden));});
  document.addEventListener('click',event=>{
    if(!statusPopover.hidden&&!statusButton.contains(event.target)&&!statusPopover.contains(event.target)){
      statusPopover.hidden=true;statusButton.setAttribute('aria-expanded','false');
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(!passwordModal.hidden){passwordModal.hidden=true;return;}
    if(!accountModal.hidden){closeAccount();return;}
    statusPopover.hidden=true;statusButton.setAttribute('aria-expanded','false');
  });
})();
