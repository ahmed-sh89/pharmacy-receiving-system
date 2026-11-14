const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');

test('new pharmacy dialog copies the complete message and offers selection if clipboard access fails',async()=>{
 const {document,Event}=parseHTML('<html><body></body></html>');
 const source=fs.readFileSync('js/settings-workspace.js','utf8');
 const clipboard=[];
 let fail=false;
 const context=vm.createContext({
  document,window:{},
  navigator:{clipboard:{async writeText(text){if(fail)throw Error('Clipboard denied');clipboard.push(text);}}},
  createSettingsModal({content}){
   document.body.append(content);
   return {close(){content.remove();}};
  }
 });
 vm.runInContext(source.slice(source.indexOf('function settingsDialog('),source.indexOf('window.settingsConfirm=')),context);
 vm.runInContext(source.slice(source.indexOf('function showCreatedPharmacyCredentials('),source.indexOf('(function bindDirectAccountCreation()')),context);
 const dialog=context.showCreatedPharmacyCredentials(
  {pharmacy_name:'Example Pharmacy',pharmacy_code:'001-a',admin_email:'submitted@example.invalid'},
  {admin_email:'created@example.invalid',temporary_password:'AB12345678'}
 );
 const field=document.querySelector('textarea');
 const button=document.querySelector('button[type=button]');
 const details=[
  'Pharmacy: Example Pharmacy',
  'Pharmacy Code: 001-A',
  'Admin Email: created@example.invalid',
  'Temporary Password: AB12345678',
  '',
  'On your first sign-in, you’ll be asked to set a new password.'
 ].join('\n');
 assert.equal(field.value,details);
 assert.equal(field.readOnly,true);
 assert.equal(button.textContent,'Copy Account Details');
 assert.deepEqual(clipboard,[]);
 await button.onclick();
 assert.deepEqual(clipboard,[details]);
 assert.equal(button.textContent,'Copied');
 fail=true;
 let selected=false;
 field.select=()=>{selected=true;};
 await button.onclick();
 assert.equal(selected,true);
 assert.equal(button.textContent,'Select and copy');
 document.querySelector('form').dispatchEvent(new Event('submit'));
 await dialog;
 assert.equal(document.querySelector('textarea'),null);
});
