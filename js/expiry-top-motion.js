/* Desktop-only presentation controller. No data fetching or operational handlers. */
let engine, loading, state;
const desktop = root => root?.isConnected && root.classList.contains('active') && !document.body.classList.contains('zebraDevice');

function dispose(){
    if(!state)return;
    const s=state;state=null;
    s.observer.disconnect();s.resize?.disconnect();
    s.media.removeEventListener('change',s.motionChanged);
    s.tweens.forEach(t=>t.kill());s.tweens.clear();
    engine.set([...s.root.querySelectorAll('.expiryKpiCard,[data-kpi-number],[data-session-total],#expiryNeedsReviewCount')],{clearProps:'transform,opacity'});
    s.indicator.remove();s.nav.classList.remove('has-motion');
}
function mount(root){
    if(state?.root===root)return state;
    dispose();
    const nav=root.querySelector('.expiryWorkspaceNav'),cards=root.querySelector('.expiryKpiRow');
    if(!nav||!cards)return null;
    const s=state={root,nav,cards,media:matchMedia('(prefers-reduced-motion: reduce)'),tweens:new Set(),values:new WeakMap(),entered:new WeakSet(),review:null,active:null};
    s.indicator=document.createElement('span');s.indicator.className='expiryNavIndicator';s.indicator.setAttribute('aria-hidden','true');nav.prepend(s.indicator);nav.classList.add('has-motion');
    s.animate=(target,vars,from)=>{
        if(s.media.matches)return;
        let tween;
        const options={...vars,overwrite:'auto',onComplete:()=>s.tweens.delete(tween),onInterrupt:()=>s.tweens.delete(tween)};
        tween=from?engine.fromTo(target,from,options):engine.to(target,options);s.tweens.add(tween);
    };
    s.navigation=()=>{
        if(state!==s)return;
        const selected=nav.querySelector('button[aria-selected="true"]');
        if(!selected)return;
        const box=selected.getBoundingClientRect(),parent=nav.getBoundingClientRect();
        if(!box.width)return;
        const target={x:box.left-parent.left,width:box.width,height:box.height};
        const geometry=JSON.stringify(target);
        if(geometry!==s.geometry){
            if(!s.active||s.media.matches)engine.set(s.indicator,target);
            else s.animate(s.indicator,{...target,duration:.25,ease:'power3.out'});
            s.geometry=geometry;
        }
        s.active=selected;
        const badge=root.querySelector('#expiryNeedsReviewCount');
        const value=badge?.hidden?null:badge?.textContent;
        if(value!==s.review && s.review!==null && value!==null)s.animate(badge,{y:0,opacity:1,duration:.24,ease:'power2.out'},{y:3,opacity:.5});
        s.review=value;
    };
    s.observer=new MutationObserver(s.navigation);
    s.observer.observe(root.querySelector('.expiryTopWorkspace'),{subtree:true,childList:true,attributes:true,attributeFilter:['aria-selected','hidden']});
    if(typeof ResizeObserver!=='undefined'){s.resize=new ResizeObserver(s.navigation);s.resize.observe(nav);}
    s.motionChanged=()=>{
        s.tweens.forEach(t=>t.kill());s.tweens.clear();
        engine.set([...cards.children,...root.querySelectorAll('[data-kpi-number],[data-session-total]'),root.querySelector('#expiryNeedsReviewCount')].filter(Boolean),{clearProps:'transform,opacity'});
        s.geometry=null;
        s.navigation();
    };
    s.media.addEventListener('change',s.motionChanged);
    return s;
}
function update(root){
    if(!desktop(root)){dispose();return;}
    const s=mount(root);if(!s)return;
    s.navigation();
    [...(s.cards.hidden?[]:s.cards.querySelectorAll('.expiryKpiCard'))].forEach((card,index)=>{
        if(!s.entered.has(card)){
            s.entered.add(card);
            s.animate(card,{y:0,opacity:1,duration:.44,delay:index*.045,ease:'power3.out'},{y:6,opacity:.55});
        }
    });
    root.querySelectorAll('[data-kpi-number],[data-session-total]').forEach(node=>{
        if(node.closest('[hidden]'))return;
        const value=node.textContent,previous=s.values.get(node);s.values.set(node,value);
        // New values appear immediately; motion never interpolates business counts.
        if(previous!==undefined && previous!==value && value!=='…' && value!=='—')s.animate(node,{y:0,opacity:1,duration:.28,ease:'power2.out'},{y:4,opacity:.45});
    });
}
function sync(root=document.getElementById('zebraExpiryShell')){
    if(!desktop(root)){dispose();return;}
    if(engine){update(root);return;}
    if(!loading)loading=import('gsap').then(module=>{engine=module.gsap;update(root);}).catch(()=>{loading=null;/* CSS and operational controls remain fully usable. */});
}
window.ExpiryTopMotion={sync,dispose};
sync();
