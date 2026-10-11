/* Login presentation only: do not initialize the protected Handheld workspace. */
(function(){
  const gate=document.getElementById("authGate");
  if(!gate || typeof isLikelyZebraDevice!=="function" || !isLikelyZebraDevice())return;
  gate.classList.add("handheldAuth");
  function resize(){
    // Android's keyboard can shrink the visible viewport without changing dvh.
    const height=window.visualViewport?.height || window.innerHeight;
    if(Number.isFinite(height) && height>0)gate.style.setProperty("--auth-visible-height",height+"px");
  }
  resize();
  window.addEventListener("resize",resize);
  window.visualViewport?.addEventListener("resize",resize);
})();
