/* Handheld presentation viewport. No auth/session or workspace initialization. */
(function(){
  if(typeof isLikelyZebraDevice!=="function" || !isLikelyZebraDevice())return;
  const root=document.documentElement,gate=document.getElementById("authGate");
  root.classList.add("handheldViewport");
  gate?.classList.add("handheldAuth");
  function resize(){
    const visible=window.visualViewport;
    const height=visible?.height || window.innerHeight;
    const top=visible?.offsetTop || 0;
    if(Number.isFinite(height) && height>0)root.style.setProperty("--handheld-visible-height",height+"px");
    if(Number.isFinite(top) && top>=0)root.style.setProperty("--handheld-visible-top",top+"px");
  }
  resize();
  window.addEventListener("resize",resize);
  window.visualViewport?.addEventListener("resize",resize);
  window.visualViewport?.addEventListener("scroll",resize);
})();
