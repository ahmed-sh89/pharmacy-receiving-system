"use strict";
const PharmFlowData={
  version:"B1",backend:"supabase",
  environment(){return window.PHARMFLOW_DEV_ENV?.enabled?"development":"production"},
  pharmacyId(){return String(window.AuthState?.context?.pharmacy_id||window.AppState?.account?.pharmacyId||"")},
  guardWrite(operation="write"){if(typeof window.pharmFlowDevAssertTenant==="function"){return window.pharmFlowDevAssertTenant(`data-layer:${operation}`)===true}return true},
  cache:{prefix:"pharmflow.next.cache.",get(key,fallback=null){try{const raw=localStorage.getItem(this.prefix+key);return raw===null?fallback:JSON.parse(raw)}catch(_){return fallback}},set(key,value){try{localStorage.setItem(this.prefix+key,JSON.stringify(value));return true}catch(_){return false}},remove(key){try{localStorage.removeItem(this.prefix+key);return true}catch(_){return false}}},
  receiving:{async getCurrent(){return window.AppState?.workspace||null}},
  expiry:{async getCurrentCaptures(){return window.ExpiryCaptureEngine?.captures||[]}},
  gtin:{lookup(gtin){if(typeof window.lookupGlobalGTIN==="function")return window.lookupGlobalGTIN(gtin);return null}},
  movement:{async query(){return []}}
};
window.PharmFlowData=PharmFlowData;
