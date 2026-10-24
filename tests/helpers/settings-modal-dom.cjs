const fs=require('node:fs'),vm=require('node:vm');
function installModalDOM(document,dom){
 dom.HTMLElement.prototype.showModal=function(){this.setAttribute('open','');};
 dom.HTMLElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new dom.Event('close'));};
 dom.HTMLElement.prototype.getBoundingClientRect=function(){return {left:10,top:10,right:500,bottom:500};};
 Object.defineProperty(dom.HTMLElement.prototype,'tabIndex',{configurable:true,get(){return this.hasAttribute('tabindex')?Number(this.getAttribute('tabindex')):/^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(this.tagName)?0:-1;},set(value){this.setAttribute('tabindex',value);}});
 dom.HTMLElement.prototype.focus=function(){document._focused=this;};dom.HTMLElement.prototype.select=function(){};
 Object.defineProperty(document,'activeElement',{configurable:true,get(){return document._focused||document.body;}});
}
function loadModalRuntime(ctx,coordinator=false){
 const src=fs.readFileSync('js/settings-workspace.js','utf8');
 vm.runInContext(src.slice(src.indexOf('// Shared native modal'),src.indexOf(coordinator?'// Permission editing is part':'// Keep the grid in place')),ctx);
}
module.exports={installModalDOM,loadModalRuntime};
