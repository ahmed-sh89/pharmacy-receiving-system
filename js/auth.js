"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   PHASE 1 — AUTH + OWNER / ADMIN / STAFF
===================================================== */

const AUTH_STORAGE_KEY = "PRS_V3_SUPABASE_AUTH";
const MEDRYVO_REMEMBERED_EMAIL_KEY = "medryvo_remembered_email";
const MEDRYVO_RECOVERY_REDIRECT = "https://ahmed-sh89.github.io/pharmacy-receiving-system/";
const AUTH_PENDING_INVITE_KEY = "PRS_V3_PENDING_INVITE";
const AUTH_PENDING_OWNER_KEY = "PRS_V3_PENDING_OWNER_SETUP";
const AUTH_PENDING_REGISTRATION_KEY = "PRS_V3_PENDING_PHARMACY_REGISTRATION";
const AUTH_REFRESH_LOCK_KEY = "PRS_V3_SUPABASE_AUTH_REFRESH_LOCK";
const AUTH_REFRESH_LOCK_MS = 8000;
const AUTH_REQUEST_TIMEOUT_MS = 12000;
const AUTH_TAB_ID = "auth-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);

const AuthState = {
    initialized:false,
    recoveryActive:false,
    session:null,
    user:null,
    context:null,
    contextError:null,
    contextLoading:false,
    ownerExists:true,
    refreshTimer:null,
    /* B10 Clean15.1 — serialize token refreshes. Scan bursts can create
       several concurrent authenticated RPCs; refresh-token rotation must
       never let a losing refresh attempt clear an otherwise valid session. */
    refreshPromise:null,
    /* A background refresh failure must not destroy an active Handheld
       Receiving workspace. This flag is UI/runtime state only; it never
       grants access or treats a failed request as successful. */
    connectionDegraded:false,
    busy:false,
    registration:null,
    mustChangePassword:false,
    ownerRegistrations:[],
    ownerManagementView:null,
    ownerManagementSearch:"",
    ownerPharmacies:[],
    lastContextScope:""
};

function getSupabaseProjectUrl(){
    return (typeof CLOUD_CONFIG !== "undefined" && CLOUD_CONFIG.url) || "";
}

function getSupabasePublishableKey(){
    return (typeof CLOUD_CONFIG !== "undefined" && CLOUD_CONFIG.publishableKey) || "";
}

function getSupabaseAccessToken(){
    return AuthState.session && AuthState.session.access_token
        ? AuthState.session.access_token
        : "";
}

async function initializeAuth(){
    if(AuthState.initialized){ return; }
    AuthState.initialized = true;
    bindAuthUI();

    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/,""));
    const isRecoveryUrl = hash.get("type") === "recovery" && !!hash.get("access_token");

    if(!isRecoveryUrl){
        clearRecoveryArtifacts();
    }

    const recoveryError = handleRecoveryErrorFromUrl();
    if(recoveryError){
        finishAuthBootState();
        return;
    }

    const recoveryMode = parseRecoverySessionFromUrl();
    if(recoveryMode){
        finishAuthBootState();
        return;
    }

    restoreAuthSession();

    /*
       STARTUP AUTHORITY GATE — validate a restored session before any
       authenticated setup/context RPC can use it. A persisted Supabase session
       keeps its original expires_at; expires_in is only the lifetime issued at
       creation and must not be treated as a fresh lifetime after reload.
    */
    if(AuthState.session && isRestoredAccessTokenStale(AuthState.session)){
        const refreshed=await refreshAuthToken().catch(()=>false);
        if(!refreshed || !AuthState.session){
            finishAuthBootState();
            renderAuthState();
            return;
        }
    }

    await loadPublicSetupStatus().catch(()=>{});

    // IMPORTANT:
    // If a stored authenticated session exists, do not render an access
    // decision here. bootstrapMedryvo() will first finish pending access,
    // load pharmacy/role context, and only then call renderAuthState().
    // This prevents "Complete access" from appearing during hard reload.
    if(AuthState.session){
        return;
    }

    finishAuthBootState();
    renderAuthState();
}


function finishAuthBootState(){
    document.body.classList.remove("authBooting");
    const bootPanel = document.getElementById("authBootPanel");
    if(bootPanel){ bootPanel.hidden = true; }
}

function bindAuthUI(){
    bindClick("btnAuthSignIn", ()=>signInFromForm());
    bindClick("btnAuthShowLogin", ()=>showAuthPanel("login"));
    bindClick("btnAuthShowLoginFromOwner", ()=>showAuthPanel("login"));
    bindClick("btnAuthShowLoginFromInvite", ()=>showAuthPanel("login"));
    bindClick("btnAuthShowPublicSignup", ()=>showAuthPanel("public"));
    bindClick("btnAuthShowOwnerSetup", ()=>showAuthPanel("owner"));
    bindClick("btnAuthForgotPassword", ()=>requestPasswordRecovery());
    bindPasswordToggle("btnToggleAuthPassword","authPassword");
    bindPasswordToggle("btnTogglePublicSignupPassword","publicSignupPassword");
    bindPasswordToggle("btnToggleInviteSignupPassword","inviteSignupPassword");
    bindPasswordToggle("btnToggleOwnerSignupPassword","ownerSignupPassword");
    restoreRememberedEmail();
    const rememberEmail = document.getElementById("authRememberEmail");
    if(rememberEmail){
        rememberEmail.addEventListener("change", ()=>{
            if(!rememberEmail.checked){
                try{ localStorage.removeItem(MEDRYVO_REMEMBERED_EMAIL_KEY); }catch(_){}
            }else{
                persistRememberedEmail(valueOf("authEmail").trim());
            }
        });
    }
    bindAuthHistoryNavigation();
    bindClick("btnAuthInviteSignUp", ()=>signUpInvitedUser());
    bindClick("btnAuthPublicSignUp", ()=>signUpPublicPharmacy());
    bindClick("btnSubmitPendingRegistration", ()=>submitRegistrationFromPendingPanel());
    bindClick("btnAuthOwnerSignUp", ()=>signUpInitialOwner());
    bindClick("btnRedeemInvite", ()=>redeemInviteFromPendingPanel());
    bindClick("btnCompleteOwnerSetup", ()=>completeOwnerSetupFromPendingPanel());
    bindClick("btnLogout", ()=>signOutCurrentUser());
    bindClick("btnPendingLogout", ()=>signOutCurrentUser());
    bindClick("btnChangeSettingsPassword", ()=>openSettingsPasswordPanel());
    bindClick("btnSaveSettingsPassword", ()=>changeSettingsPassword());
    document.querySelectorAll("[data-settings-password-close]").forEach(button=>{
        button.addEventListener("click",()=>closeSettingsPasswordPanel());
    });
    bindClick("btnOwnerCreatePharmacy", ()=>ownerCreatePharmacyFromSettings());
    bindClick("btnCloseOwnerManagement", ()=>closeOwnerManagementPanel());
    bindClick("btnEditSettingsIdentity", ()=>setSettingsIdentityEditMode(true));
    bindClick("btnCancelSettingsIdentity", ()=>setSettingsIdentityEditMode(false));
    bindClick("btnSaveSettingsIdentity", ()=>saveSettingsIdentity());
    document.querySelectorAll("[data-owner-view]").forEach(card=>{
        card.addEventListener("click",()=>openOwnerManagementPanel(card.dataset.ownerView));
    });
    const ownerSearch=document.getElementById("ownerManagementSearch");
    if(ownerSearch){
        ownerSearch.addEventListener("input",()=>{
            AuthState.ownerManagementSearch=ownerSearch.value || "";
            renderOwnerManagementPanel();
        });
    }
    bindClick("btnCreateMemberInvite", ()=>createMemberInviteFromSettings());

    ["authEmail","authPassword"].forEach(id=>{
        const el = document.getElementById(id);
        if(el){
            el.addEventListener("keydown", event=>{
                if(event.key === "Enter"){
                    event.preventDefault();
                    signInFromForm();
                }
            });
        }
    });
}


function bindPasswordToggle(buttonId, inputId){
    const button = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    if(!button || !input){ return; }

    button.addEventListener("click", ()=>{
        const reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        button.textContent = reveal ? "Hide" : "Show";
        button.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
        button.setAttribute("aria-pressed", reveal ? "true" : "false");
        input.focus({preventScroll:true});
    });
}

function restoreRememberedEmail(){
    try{
        const remembered = localStorage.getItem(MEDRYVO_REMEMBERED_EMAIL_KEY) || "";
        if(remembered){
            setInputValue("authEmail", remembered);
            const checkbox = document.getElementById("authRememberEmail");
            if(checkbox){ checkbox.checked = true; }
        }
    }catch(_){}
}

function persistRememberedEmail(email){
    try{
        const checkbox = document.getElementById("authRememberEmail");
        if(checkbox && checkbox.checked){
            localStorage.setItem(MEDRYVO_REMEMBERED_EMAIL_KEY, email);
        }else{
            localStorage.removeItem(MEDRYVO_REMEMBERED_EMAIL_KEY);
        }
    }catch(_){}
}


function clearSensitiveAuthFields(){
    const passwordFieldIds = [
        "authPassword",
        "publicSignupPassword",
        "inviteSignupPassword",
        "ownerSignupPassword",
        "authRecoveryPassword",
        "authRecoveryPasswordConfirm"
    ];

    passwordFieldIds.forEach(id=>{
        const input = document.getElementById(id);
        if(!input){ return; }
        input.value = "";
        input.type = "password";
    });

    document.querySelectorAll(".authPasswordToggle").forEach(button=>{
        button.textContent = "Show";
        button.setAttribute("aria-label","Show password");
        button.setAttribute("aria-pressed","false");
    });
}


function clearRecoveryArtifacts(){
    AuthState.recoveryActive = false;
    window.__MEDRYVO_RECOVERY_ACTIVE = false;
    document.body.classList.remove("medryvoRecoveryMode");
    unmountRecoveryForm();

    try{
        if(window.location.hash){
            history.replaceState(
                Object.assign({}, history.state || {}, {medryvoAuthMode:"login"}),
                "",
                window.location.pathname + window.location.search
            );
        }
    }catch(_){}
}

function bindClick(id, handler){
    document.querySelectorAll('[id="' + id + '"]').forEach(el=>{
        el.addEventListener("click", handler);
    });
}


function bindAuthHistoryNavigation(){
    if(window.__MEDRYVO_AUTH_HISTORY_BOUND){ return; }
    window.__MEDRYVO_AUTH_HISTORY_BOUND = true;

    const initialMode = getVisibleAuthMode() || "login";
    const currentState = history.state || {};
    if(!currentState.medryvoAuthMode){
        history.replaceState(
            Object.assign({}, currentState, {medryvoAuthMode: initialMode}),
            "",
            window.location.href
        );
    }

    window.addEventListener("popstate", event=>{
        if(document.body && document.body.classList.contains("authLocked")){
            const mode = event.state && event.state.medryvoAuthMode
                ? event.state.medryvoAuthMode
                : "login";
            showAuthPanel(mode, {history:"none"});
        }
    });
}

function getVisibleAuthMode(){
    const map = {
        login:"authLoginForm",
        public:"authPublicSignupForm",
        invite:"authInviteSignupForm",
        owner:"authOwnerSignupForm",
        recovery:"authRecoveryForm"
    };
    for(const [mode,id] of Object.entries(map)){
        const el = document.getElementById(id);
        if(el && !el.hidden){ return mode; }
    }
    return "login";
}

function syncAuthHistory(mode, behavior){
    if(behavior === "none"){ return; }

    const currentMode = history.state && history.state.medryvoAuthMode;
    if(currentMode === mode){ return; }

    const nextState = Object.assign({}, history.state || {}, {medryvoAuthMode:mode});

    if(behavior === "replace"){
        history.replaceState(nextState, "", window.location.href);
        return;
    }

    history.pushState(nextState, "", window.location.href);
}


function setRecoveryMessage(message,type){
    const el = document.getElementById("authRecoveryMessage");
    if(!el){ return; }
    el.textContent = message || "";
    el.className = "authMessage " + (type || "");
}

async function requestPasswordRecovery(){
    setAuthMessage("Contact your PharmFlow Admin to receive a temporary password. No recovery email will be sent.","info");
}


function handleRecoveryErrorFromUrl(){
    AuthState.recoveryActive = false;
    window.__MEDRYVO_RECOVERY_ACTIVE = false;
    document.body.classList.remove("medryvoRecoveryMode");
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/,""));
    const errorCode = hash.get("error_code") || "";
    const errorDescription = (hash.get("error_description") || "").replace(/\+/g," ");
    if(!errorCode){ return false; }

    showAuthPanel("login",{history:"replace"});
    if(errorCode === "otp_expired"){
        setAuthMessage("This password reset link has expired or was already used. Request a new link with Forgot Password.", "error");
    }else{
        setAuthMessage(errorDescription || "The password reset link is invalid. Request a new link.", "error");
    }
    try{
        history.replaceState({medryvoAuthMode:"login"},"",window.location.pathname + window.location.search);
    }catch(_){}
    return true;
}


function mountRecoveryForm(){
    let recovery = document.getElementById("authRecoveryForm");
    if(recovery){ return recovery; }

    const template = document.getElementById("authRecoveryTemplate");
    const formsPanel = document.getElementById("authFormsPanel");
    if(!template || !formsPanel){ return null; }

    const fragment = template.content.cloneNode(true);
    formsPanel.appendChild(fragment);
    recovery = document.getElementById("authRecoveryForm");

    // The recovery controls are created dynamically, so bind them here.
    bindClick("btnAuthRecoverySave", ()=>saveRecoveredPassword());
    bindPasswordToggle("btnToggleRecoveryPassword","authRecoveryPassword");
    bindPasswordToggle("btnToggleRecoveryPasswordConfirm","authRecoveryPasswordConfirm");

    return recovery;
}

function unmountRecoveryForm(){
    const recovery = document.getElementById("authRecoveryForm");
    if(recovery){ recovery.remove(); }
}

function parseRecoverySessionFromUrl(){
    const hash = new URLSearchParams((window.location.hash || "").replace(/^#/,""));
    const type = hash.get("type") || "";
    const accessToken = hash.get("access_token") || "";
    const refreshToken = hash.get("refresh_token") || "";

    // IMPORTANT:
    // Recovery mode is valid ONLY when the current browser URL itself
    // is a Supabase recovery URL. A previous recovery session/state
    // must never trigger this screen during an ordinary sign in.
    if(type !== "recovery" || !accessToken){
        clearRecoveryArtifacts();
        return false;
    }

    AuthState.recoveryActive = true;
    window.__MEDRYVO_RECOVERY_ACTIVE = true;
    document.body.classList.add("medryvoRecoveryMode");
    mountRecoveryForm();

    AuthState.session = {
        access_token:accessToken,
        refresh_token:refreshToken,
        token_type:hash.get("token_type") || "bearer",
        expires_in:Number(hash.get("expires_in") || 0)
    };

    showAuthPanel("recovery",{history:"replace"});
    return true;
}

async function saveRecoveredPassword(){
    if(AuthState.busy){ return; }
    const password=valueOf("authRecoveryPassword");
    const confirmPassword=valueOf("authRecoveryPasswordConfirm");
    if(password.length < 8){ setRecoveryMessage("Password must be at least 8 characters.","error"); return; }
    if(password !== confirmPassword){ setRecoveryMessage("The two passwords do not match.","error"); return; }
    const token=getSupabaseAccessToken();
    if(!token){ setRecoveryMessage("Recovery session is missing or expired. Request a new link.","error"); return; }
    setAuthBusy(true,"Updating password...");
    try{
        await authRequest("/auth/v1/user",{
            method:"PUT",
            headers:{"Authorization":"Bearer "+token},
            body:JSON.stringify({password})
        });
        clearRecoveryArtifacts();
        try{
            history.replaceState(
                Object.assign({}, history.state || {}, {medryvoAuthMode:"login"}),
                "",
                window.location.pathname + window.location.search
            );
        }catch(_){}
        try{
        clearSensitiveAuthFields();
            await authRequest("/auth/v1/logout",{method:"POST",headers:{"Authorization":"Bearer "+token},body:"{}"});
        }catch(_){ }
        persistAuthSession(null);
        setInputValue("authRecoveryPassword","");
        setInputValue("authRecoveryPasswordConfirm","");
        showAuthPanel("login",{history:"replace"});
        setAuthMessage("Password updated successfully. Sign in with your new password.","success");
    }
    catch(error){ setRecoveryMessage(error.message || "Unable to update password.","error"); }
    finally{ setAuthBusy(false); }
}

function restoreAuthSession(){
    try{
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if(!raw){ return; }
        const parsed = JSON.parse(raw);
        if(parsed && parsed.access_token && parsed.refresh_token){
            AuthState.session = parsed;
            AuthState.user = parsed.user || null;
            scheduleTokenRefresh(parsed);
        }
    }
    catch(_){
        localStorage.removeItem(AUTH_STORAGE_KEY);
    }
}

function persistAuthSession(session){
    AuthState.session = session || null;
    AuthState.user = session && session.user ? session.user : null;
    AuthState.mustChangePassword = !!(AuthState.user?.app_metadata?.pharmflow_must_change_password);
    AuthState.contextError = null;

    if(session){
        AuthState.connectionDegraded=false;
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
        scheduleTokenRefresh(session);
    }
    else{
        localStorage.removeItem(AUTH_STORAGE_KEY);
        if(AuthState.refreshTimer){ clearTimeout(AuthState.refreshTimer); }
        AuthState.refreshTimer = null;
    }
}

function isActiveHandheldWorkspace(){
    return !!(
        AuthState.context?.pharmacy_id &&
        typeof isLikelyZebraDevice==="function" &&
        isLikelyZebraDevice() &&
        (
            document.body.classList.contains("zebraReceivingActive") ||
            document.body.classList.contains("zebraExpiryActive")
        )
    );
}

function setAuthConnectionDegraded(degraded){
    AuthState.connectionDegraded=degraded===true;
    try{
        window.dispatchEvent(new CustomEvent("pharmflow:auth-connection",{
            detail:{degraded:AuthState.connectionDegraded}
        }));
    }catch(_){ }
}

function clearRejectedAuthSession(expectedRefreshToken){
    const stored=readStoredAuthSession();
    if(
        stored?.refresh_token &&
        String(stored.refresh_token)!==String(expectedRefreshToken||"")
    ){
        persistAuthSession(stored);
        return false;
    }

    const previousScope=String(AuthState.lastContextScope||"");
    AuthState.session=null;
    AuthState.user=null;
    AuthState.context=null;
    AuthState.registration=null;
    AuthState.lastContextScope="";
    AuthState.contextError=null;
    if(AuthState.refreshTimer){ clearTimeout(AuthState.refreshTimer); }
    AuthState.refreshTimer=null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_REFRESH_LOCK_KEY);
    publishAuthenticatedContextReady(previousScope,"");

    queueMicrotask(()=>{
        lockApplicationForAuth?.();
        renderAuthState?.();
        setAuthMessage?.(
            "Your saved sign-in expired. Please sign in again.",
            "error"
        );
    });
    return true;
}

function isRestoredAccessTokenStale(session){
    if(!session?.access_token || !session?.refresh_token){ return true; }

    const expiresAt=Number(session.expires_at||0);
    if(expiresAt>0){
        /* Refresh before the first protected RPC when the stored JWT is
           expired or within the same two-minute safety window used by the
           normal refresh scheduler. */
        return (expiresAt*1000)-Date.now()<=120000;
    }

    /* Older stored sessions without an absolute expiry cannot be proven fresh.
       Validate them through the existing single-flight refresh path rather
       than allowing an avoidable 401 to become the first startup request. */
    return true;
}

function scheduleTokenRefresh(session){
    if(AuthState.refreshTimer){ clearTimeout(AuthState.refreshTimer); }
    if(!session || !session.expires_in || !session.refresh_token){ return; }
    const ms = Math.max(30000, (Number(session.expires_in) * 1000) - 120000);
    AuthState.refreshTimer = setTimeout(()=>refreshAuthToken().catch(()=>{}), ms);
}

async function authRequest(path, options = {}){
    const headers = {
        "apikey":getSupabasePublishableKey(),
        "Content-Type":"application/json",
        ...(options.headers || {})
    };
    let controller=null;
    let requestOptions={...options,headers};

    if(typeof AbortController!=="undefined" && !options.signal){
        controller=new AbortController();
        requestOptions={...requestOptions,signal:controller.signal};
    }

    let response;
    let timeoutTimer=null;
    let text="";
    try{
        const timeout=new Promise((_,reject)=>{
            timeoutTimer=setTimeout(()=>{
                try{controller?.abort();}catch(_){}
                reject(new Error("PharmFlow connection timed out. Please try again."));
            },AUTH_REQUEST_TIMEOUT_MS);
        });
        response=await Promise.race([
            fetch(getSupabaseProjectUrl() + path,requestOptions),
            timeout
        ]);
        // Keep the same deadline while reading the response body. A fetch may
        // resolve headers and then stall indefinitely while the body streams.
        text=await Promise.race([response.text(),timeout]);
    }catch(error){
        if(error?.name==="AbortError"){
            throw new Error("PharmFlow connection timed out. Please try again.");
        }
        throw error;
    }finally{
        if(timeoutTimer){ clearTimeout(timeoutTimer); }
    }
    let data = null;
    try{ data = text ? JSON.parse(text) : null; }
    catch(_){ data = text; }
    if(!response.ok){
        const error = new Error(
            (data && (data.msg || data.message || data.error_description || data.error || data.hint)) ||
            ("Authentication request failed (" + response.status + ")")
        );
        // Keep the fact that an HTTP response arrived so idempotent Expiry
        // writes can distinguish a definitive PostgREST rejection from a
        // network failure whose commit result is unknown. Do not retain or
        // log the response body here.
        error.httpStatus=response.status;
        error.serverRejected=true;
        throw error;
    }
    return data;
}

async function publicRpc(functionName, params = {}){
    return authRequest("/rest/v1/rpc/" + encodeURIComponent(functionName), {
        method:"POST",
        headers:{
            "Authorization":"Bearer " + getSupabasePublishableKey(),
            "Accept":"application/json"
        },
        body:JSON.stringify(params || {})
    });
}

async function authRpc(functionName, params = {}){
    const execute = async () => {
        const token = getSupabaseAccessToken();
        if(!token){ throw new Error("Please sign in first"); }
        return authRequest("/rest/v1/rpc/" + encodeURIComponent(functionName), {
            method:"POST",
            headers:{"Authorization":"Bearer " + token,"Accept":"application/json"},
            body:JSON.stringify(params || {})
        });
    };

    try{
        return await execute();
    }catch(error){
        const message = String(error?.message || "").toLowerCase();
        const looksExpired =
            message.includes("jwt expired") ||
            message.includes("token is expired") ||
            message.includes("invalid jwt");

        if(!looksExpired){ throw error; }

        const refreshed =
            typeof refreshAuthToken === "function"
                ? await refreshAuthToken()
                : false;

        if(!refreshed){
            throw new Error("Your sign-in expired. Please sign in again.");
        }

        return execute();
    }
}

async function loadPublicSetupStatus(){
    const result = await publicRpc("get_public_setup_status",{});
    const row = Array.isArray(result) ? result[0] : result;
    AuthState.ownerExists = !!(row && row.owner_exists);

    // Do NOT render here.
    // This function is often called immediately after authentication,
    // before loadMyAppContext() has finished. Rendering at that moment
    // makes a valid pharmacy user look temporarily unassigned and causes
    // the "Complete access" panel to flash for a fraction of a second.
    return AuthState.ownerExists;
}

async function signInFromForm(){
    if(AuthState.busy){ return; }

    // A normal password sign-in must never inherit recovery state.
    clearRecoveryArtifacts();
    showAuthPanel("login",{history:"replace"});

    const email = valueOf("authEmail").trim();
    const password = valueOf("authPassword");
    if(!email || !password){
        setAuthMessage("Enter email and password.", "error");
        return;
    }
    persistRememberedEmail(email);
    setAuthBusy(true, "Signing in...");
    try{
        const session = await authRequest("/auth/v1/token?grant_type=password", {
            method:"POST",
            body:JSON.stringify({email,password})
        });
        persistAuthSession(session);
        await loadPublicSetupStatus().catch(()=>{});
        await finishPendingAccessIfPossible();
        await loadMyAppContext();
        renderAuthState();
        if(AuthState.mustChangePassword){
            return;
        }
        if(hasApplicationAccess()){
            setAuthMessage("Signed in successfully.", "success");
            unlockApplicationAfterAuth();
        }
    }
    catch(error){
        setAuthMessage(error.message || "Sign in failed.", "error");
    }
    finally{ setAuthBusy(false); }
}


async function signUpPublicPharmacy(){
    if(AuthState.busy){ return; }
    const email = valueOf("publicSignupEmail").trim();
    const password = valueOf("publicSignupPassword");
    const confirmPassword = valueOf("publicSignupPasswordConfirm");
    const pharmacyCode = valueOf("publicPharmacyCode").trim();
    if(!email || password.length < 8 || password !== confirmPassword || pharmacyCode.length < 3){
        setAuthMessage("Enter a valid email, matching passwords of at least 8 characters, and your pharmacy code.","error");
        return;
    }
    localStorage.setItem(AUTH_PENDING_REGISTRATION_KEY,JSON.stringify({pharmacyCode}));
    setAuthBusy(true,"Creating account...");
    try{
        const result = await authRequest("/auth/v1/signup",{
            method:"POST",
            body:JSON.stringify({email,password})
        });
        if(result && result.access_token){
            persistAuthSession(result);
            await submitPendingRegistration();
            await loadMyAppContext();
            await loadMyRegistrationStatus();
            renderAuthState();
        }else{
            setAuthMessage("Account created. Sign in with the same email and password to finish the pharmacy request.","success");
            showAuthPanel("login");
            setInputValue("authEmail",email);
        }
    }catch(error){
        setAuthMessage(error.message || "Unable to create account.","error");
    }finally{ setAuthBusy(false); }
}

async function submitPendingRegistration(){
    const raw = localStorage.getItem(AUTH_PENDING_REGISTRATION_KEY);
    if(!raw){ return false; }
    const setup = JSON.parse(raw);
    await authRpc("submit_pharmacy_registration_v2",{
        p_requested_pharmacy_code:setup.pharmacyCode
    });
    localStorage.removeItem(AUTH_PENDING_REGISTRATION_KEY);
    await loadMyRegistrationStatus().catch(()=>{});
    return true;
}

async function submitRegistrationFromPendingPanel(){
    if(AuthState.busy){ return; }
    const pharmacyCode = valueOf("pendingRegistrationPharmacyCode").trim();
    if(pharmacyCode.length < 3){
        setAuthMessage("Enter the pharmacy code you know (at least 3 characters).","error");
        return;
    }
    localStorage.setItem(AUTH_PENDING_REGISTRATION_KEY,JSON.stringify({pharmacyCode}));
    setAuthBusy(true,"Submitting pharmacy request...");
    try{
        await submitPendingRegistration();
        await loadMyRegistrationStatus();
        renderAuthState();
        setAuthMessage("Registration submitted. Waiting for approval.","success");
    }catch(error){
        setAuthMessage(error.message || "Unable to submit registration.","error");
    }finally{ setAuthBusy(false); }
}

async function loadMyRegistrationStatus(){
    if(!getSupabaseAccessToken()){ AuthState.registration=null; return null; }
    try{
        const rows = await authRpc("get_my_pharmacy_registration",{});
        const row = Array.isArray(rows) ? rows[0] : rows;
        AuthState.registration = row || null;
        return AuthState.registration;
    }
    catch(_){ AuthState.registration=null; return null; }
}

async function signUpInvitedUser(){
    if(AuthState.busy){ return; }
    const name = valueOf("inviteSignupName").trim();
    const email = valueOf("inviteSignupEmail").trim();
    const password = valueOf("inviteSignupPassword");

    if(!email || password.length < 8){
        setAuthMessage("Enter the assigned admin email and a password of at least 8 characters.","error");
        return;
    }

    setAuthBusy(true,"Creating admin account...");
    try{
        const result = await authRequest("/auth/v1/signup",{
            method:"POST",
            body:JSON.stringify({
                email,password,
                data:{display_name:name || email.split("@")[0]}
            })
        });

        if(result && result.access_token){
            persistAuthSession(result);
            await claimAssignedAdminIfAvailable(true);
            await loadMyAppContext();
            renderAuthState();

            if(hasApplicationAccess()){
                setAuthMessage("Admin account activated successfully.","success");
                unlockApplicationAfterAuth();
            }else{
                throw new Error("This email is not currently assigned as a pharmacy ADMIN.");
            }
        }else{
            setAuthMessage(
                "Account created. Confirm the email if requested, then Sign In with the same email. PharmFlow will claim the ADMIN assignment automatically.",
                "success"
            );
            showAuthPanel("login");
            setInputValue("authEmail",email);
        }
    }
    catch(error){
        const message = String(error && error.message || "");
        if(/already|registered|exists/i.test(message)){
            setAuthMessage("This email already has an account. Use Sign In; the ADMIN assignment will be linked automatically.","error");
            showAuthPanel("login");
            setInputValue("authEmail",email);
        }else{
            setAuthMessage(message || "Unable to activate the ADMIN account.","error");
        }
    }
    finally{ setAuthBusy(false); }
}

async function signUpInitialOwner(){
    if(AuthState.busy){ return; }
    await loadPublicSetupStatus().catch(()=>{});
    if(AuthState.ownerExists){
        setAuthMessage("The PharmFlow Administrator is already configured. Use the assigned access path to activate a new account.","error");
        showAuthPanel("login");
        return;
    }
    const name = valueOf("ownerSignupName").trim();
    const email = valueOf("ownerSignupEmail").trim();
    const password = valueOf("ownerSignupPassword");
    const pharmacyName = valueOf("ownerPharmacyName").trim();
    const pharmacyCode = valueOf("ownerPharmacyCode").trim();
    if(!email || password.length < 6 || !pharmacyName || pharmacyCode.length < 3){
        setAuthMessage("Complete owner details, pharmacy name/code, and use a password of at least 6 characters.","error");
        return;
    }
    localStorage.setItem(AUTH_PENDING_OWNER_KEY, JSON.stringify({pharmacyName,pharmacyCode}));
    setAuthBusy(true,"Creating owner account...");
    try{
        const result = await authRequest("/auth/v1/signup",{
            method:"POST",
            body:JSON.stringify({
                email,password,
                data:{display_name:name || email.split("@")[0]}
            })
        });
        if(result && result.access_token){
            persistAuthSession(result);
            await completePendingOwnerSetup();
            await loadMyAppContext();
            renderAuthState();
            if(!hasApplicationAccess()){
                throw new Error("Owner account exists, but pharmacy access was not verified.");
            }
            setAuthMessage("PharmFlow Administrator and pharmacy created successfully.","success");
            unlockApplicationAfterAuth();
        }
        else{
            const identities = result && result.user && Array.isArray(result.user.identities)
                ? result.user.identities
                : null;
            const likelyExistingAccount = identities && identities.length === 0;

            showAuthPanel("login");
            setInputValue("authEmail",email);
            setInputValue("authPassword","");

            if(likelyExistingAccount){
                setAuthMessage(
                    "This email already has an authentication account. Administrator setup is NOT complete yet. Sign in with that account (or reset its password) to finish the saved setup.",
                    "error"
                );
            }
            else{
                setAuthMessage(
                    "Authentication account created. Administrator setup is NOT complete yet. Confirm the email if requested, then sign in with the same password to finish the saved pharmacy setup.",
                    "success"
                );
            }
        }
    }
    catch(error){ setAuthMessage(error.message || "Owner setup failed.","error"); }
    finally{ setAuthBusy(false); }
}

function readStoredAuthSession(){
    try{
        const raw=localStorage.getItem(AUTH_STORAGE_KEY);
        if(!raw){ return null; }
        const parsed=JSON.parse(raw);
        return parsed && parsed.access_token && parsed.refresh_token
            ? parsed
            : null;
    }catch(_){
        return null;
    }
}

function isIrrecoverableRefreshError(error){
    const message=String(error?.message||"").toLowerCase();
    return (
        message.includes("invalid refresh token") ||
        message.includes("refresh token not found") ||
        message.includes("refresh token has expired") ||
        message.includes("refresh_token_not_found")
    );
}

function readAuthRefreshLock(){
    try{
        const parsed=JSON.parse(localStorage.getItem(AUTH_REFRESH_LOCK_KEY)||"null");
        return parsed && parsed.owner && Number(parsed.expiresAt)>Date.now()
            ? parsed
            : null;
    }catch(_){
        return null;
    }
}

function acquireAuthRefreshLock(){
    const current=readAuthRefreshLock();
    if(current && current.owner!==AUTH_TAB_ID){ return false; }

    const lock={owner:AUTH_TAB_ID,expiresAt:Date.now()+AUTH_REFRESH_LOCK_MS};
    try{
        localStorage.setItem(AUTH_REFRESH_LOCK_KEY,JSON.stringify(lock));
        return readAuthRefreshLock()?.owner===AUTH_TAB_ID;
    }catch(_){
        return true;
    }
}

function releaseAuthRefreshLock(){
    try{
        if(readAuthRefreshLock()?.owner===AUTH_TAB_ID){
            localStorage.removeItem(AUTH_REFRESH_LOCK_KEY);
        }
    }catch(_){ }
}

function waitForRotatedStoredSession(startingAccessToken,timeoutMs=3500){
    return new Promise(resolve=>{
        const deadline=Date.now()+timeoutMs;
        const inspect=()=>{
            const stored=readStoredAuthSession();
            if(
                stored?.access_token &&
                String(stored.access_token)!==String(startingAccessToken||"")
            ){
                persistAuthSession(stored);
                resolve(true);
                return;
            }
            if(Date.now()>=deadline){ resolve(false); return; }
            setTimeout(inspect,100);
        };
        inspect();
    });
}

window.addEventListener("storage",event=>{
    if(event.key!==AUTH_STORAGE_KEY || !event.newValue){ return; }
    const stored=readStoredAuthSession();
    if(
        stored?.access_token &&
        String(stored.access_token)!==String(AuthState.session?.access_token||"")
    ){
        persistAuthSession(stored);
    }
});

async function refreshAuthToken(){
    if(!AuthState.session || !AuthState.session.refresh_token){ return false; }

    /* B10 Clean15.1 — SINGLE-FLIGHT AUTH REFRESH.
       A rapid Handheld scan burst can overlap write + delta-sync RPCs. If the
       JWT expires in that window, several callers used to rotate the same
       refresh token concurrently. The first refresh succeeded; a later losing
       request could then execute persistAuthSession(null), forcing the scanner
       back to Sign In despite a valid freshly-refreshed session.

       All callers in this page now share one refresh promise. A failed attempt
       also adopts a newer session from storage (e.g. another same-origin tab)
       before deciding that authentication is actually lost. Transient network
       failures never destroy the stored session. */
    if(AuthState.refreshPromise){
        return AuthState.refreshPromise;
    }

    const startingSession=AuthState.session;
    const startingAccessToken=String(startingSession?.access_token||"");
    const startingRefreshToken=String(startingSession?.refresh_token||"");

    AuthState.refreshPromise=(async()=>{
        let ownsRefreshLock=false;
        try{
            const storedBeforeRefresh=readStoredAuthSession();
            if(
                storedBeforeRefresh?.access_token &&
                String(storedBeforeRefresh.access_token)!==startingAccessToken
            ){
                persistAuthSession(storedBeforeRefresh);
                return true;
            }

            ownsRefreshLock=acquireAuthRefreshLock();
            if(!ownsRefreshLock){
                const adopted=await waitForRotatedStoredSession(startingAccessToken);
                if(adopted){ return true; }
                ownsRefreshLock=acquireAuthRefreshLock();
                if(!ownsRefreshLock){ return false; }
            }

            const session=await authRequest("/auth/v1/token?grant_type=refresh_token",{
                method:"POST",
                body:JSON.stringify({refresh_token:startingRefreshToken})
            });
            persistAuthSession(session);
            setAuthConnectionDegraded(false);
            return true;
        }catch(error){
            /* If another context refreshed while this request was in flight,
               adopt that newer session instead of treating this race as logout. */
            const memorySession=AuthState.session;
            if(
                memorySession?.access_token &&
                String(memorySession.access_token)!==startingAccessToken
            ){
                return true;
            }

            const storedSession=readStoredAuthSession();
            if(
                storedSession?.access_token &&
                String(storedSession.access_token)!==startingAccessToken
            ){
                persistAuthSession(storedSession);
                return true;
            }

            if(isIrrecoverableRefreshError(error)){
                /* Give another tab's successful rotation one final chance to
                   arrive before removing only this rejected local session. */
                const adopted=await waitForRotatedStoredSession(startingAccessToken,500);
                if(adopted){ return true; }
                if(isActiveHandheldWorkspace()){
                    /* B10 Clean15.3 — a scan burst can overlap a refresh-token
                       rotation or a short connection failure. Preserve the last
                       authenticated Handheld workspace and let later activity /
                       reconnect retry through the existing single-flight path.
                       Failed RPCs still fail; this does not bypass authorization
                       and does not manufacture a successful scan. */
                    setAuthConnectionDegraded(true);
                    Logger?.warn?.(
                        "Auth refresh rejected; preserving active Handheld workspace",
                        error
                    );
                }else{
                    /* At boot (or outside an active Handheld workflow), clear a
                       genuinely stale session so Preparing PharmFlow cannot hang. */
                    clearRejectedAuthSession(startingRefreshToken);
                    Logger?.warn?.("Expired local auth session cleared",error);
                }
            }
            return false;
        }finally{
            if(ownsRefreshLock){ releaseAuthRefreshLock(); }
            AuthState.refreshPromise=null;
        }
    })();

    return AuthState.refreshPromise;
}

window.addEventListener("online",()=>{
    if(!AuthState.connectionDegraded || !isActiveHandheldWorkspace()) return;
    refreshAuthToken().then(refreshed=>{
        if(refreshed){
            setAuthConnectionDegraded(false);
            window.refreshUnifiedHandheldWorkspace?.({silent:true});
        }
    }).catch(()=>{});
});


function getAuthContextScope(row=AuthState.context){
    const pharmacyId=String(row?.pharmacy_id||"").trim();
    const userId=String(row?.user_id||AuthState.user?.id||"").trim();

    return pharmacyId && userId
        ? pharmacyId+"__"+userId
        : "";
}

function publishAuthenticatedContextReady(previousScope,newScope){
    try{
        window.dispatchEvent(
            new CustomEvent(
                "auth:context-ready",
                {
                    detail:{
                        previousScope:previousScope||"",
                        currentScope:newScope||"",
                        pharmacyId:AuthState.context?.pharmacy_id||null,
                        userId:AuthState.context?.user_id||null,
                        changed:
                            !!previousScope &&
                            previousScope!==newScope
                    }
                }
            )
        );
    }catch(_){}
}

window.getAuthContextScope=getAuthContextScope;


async function loadMyAppContext(){
    if(!getSupabaseAccessToken()){
        AuthState.context = null;
        AuthState.contextError = null;
        AuthState.contextLoading = false;
        return null;
    }

    AuthState.contextLoading = true;
    AuthState.contextError = null;
    try{
        const rows = await authRpc("get_my_app_context",{});
        const row = Array.isArray(rows) ? rows[0] : rows;
        const previousScope=String(
            AuthState.lastContextScope || ""
        );

        AuthState.context = row || null;
        AuthState.contextError = null;

        /*
           DEVISO3 AUTHENTICATION BOUNDARY HOOK

           Development B is allowed to authenticate against the shared
           Supabase project, but it must NEVER hydrate/render another
           pharmacy workspace.  The environment hook is evaluated here,
           before AppState receives the account and before auth:context-ready
           can wake cloud/workspace listeners.
        */
        if(
            typeof window.pharmFlowDevValidateAuthenticatedContext === "function" &&
            window.pharmFlowDevValidateAuthenticatedContext(row) !== true
        ){
            AuthState.lastContextScope="";

            if(typeof AppState !== "undefined"){
                if(typeof createEmptyAccountContext === "function"){
                    AppState.account=createEmptyAccountContext();
                }
                if(typeof createEmptyWorkspace === "function"){
                    AppState.workspace=createEmptyWorkspace();
                }
                if(typeof createEmptySession === "function"){
                    AppState.session=createEmptySession();
                }
                if(AppState.archive){
                    AppState.archive.orders=[];
                    AppState.archive.transactions=[];
                }
                resetStatistics?.();
                rebuildStateIndexes?.();
            }

            return row;
        }

        if(typeof AppState !== "undefined"){
            AppState.account = normalizeAccountContext(row);
        }

        const newScope=getAuthContextScope(row);
        AuthState.lastContextScope=newScope;

        publishAuthenticatedContextReady(
            previousScope,
            newScope
        );

        return row;
    }
    catch(error){
        if(/jwt|token|expired/i.test(error.message || "")){
            const refreshed = await refreshAuthToken();
            if(refreshed){ return loadMyAppContext(); }
        }
        AuthState.contextError = error;
        throw error;
    }
    finally{
        AuthState.contextLoading = false;
    }
}

function normalizeAccountContext(row){
    return {
        userId:row && row.user_id || null,
        email:row && row.email || "",
        displayName:row && row.display_name || "",
        pharmacyId:row && row.pharmacy_id || null,
        pharmacyCode:row && row.pharmacy_code || "",
        pharmacyName:row && row.pharmacy_name || "",
        role:row && row.member_role || "",
        systemRole:row && row.system_role || ""
    };
}

function hasApplicationAccess(){
    const baseAccess=!!(AuthState.context && AuthState.context.pharmacy_id);

    if(!baseAccess){
        return false;
    }

    /*
       B-only environment policy may further restrict application access.
       Production A has no hook, so its behavior is unchanged.
    */
    if(typeof window.pharmFlowDevValidateAuthenticatedContext === "function"){
        return window.pharmFlowDevValidateAuthenticatedContext(AuthState.context) === true;
    }

    return true;
}


async function claimAssignedAdminIfAvailable(throwIfMissing=false){
    if(!getSupabaseAccessToken()){ return null; }
    try{
        const rows = await authRpc("claim_pharmacy_admin_assignment",{});
        const row = Array.isArray(rows) ? rows[0] : rows;
        return row || null;
    }catch(error){
        const message = String(error && error.message || "");
        if(!throwIfMissing && /no pending admin assignment|not assigned|assignment/i.test(message)){
            return null;
        }
        if(throwIfMissing){ throw error; }
        return null;
    }
}

async function finishPendingAccessIfPossible(){
    if(!getSupabaseAccessToken()){ return; }
    await claimAssignedAdminIfAvailable(false).catch(()=>{});
    if(localStorage.getItem(AUTH_PENDING_OWNER_KEY)){
        await loadPublicSetupStatus().catch(()=>{});
        if(!AuthState.ownerExists){
            await completePendingOwnerSetup();
            await loadMyAppContext();
            return;
        }
        // Another verified Owner already exists: discard stale first-setup data.
        localStorage.removeItem(AUTH_PENDING_OWNER_KEY);
    }
    if(localStorage.getItem(AUTH_PENDING_REGISTRATION_KEY)){
        await submitPendingRegistration();
    }
    if(localStorage.getItem(AUTH_PENDING_INVITE_KEY)){
        await redeemPendingInvite();
    }
    await loadMyRegistrationStatus().catch(()=>{});
}

async function completePendingOwnerSetup(){
    const raw = localStorage.getItem(AUTH_PENDING_OWNER_KEY);
    if(!raw){ return false; }

    let setup;
    try{
        setup = JSON.parse(raw);
    }
    catch(_){
        localStorage.removeItem(AUTH_PENDING_OWNER_KEY);
        throw new Error("Saved Owner setup data is invalid. Please start the setup again.");
    }

    const result = await authRpc("bootstrap_system_owner",{
        p_pharmacy_name:setup.pharmacyName,
        p_pharmacy_code:setup.pharmacyCode
    });
    const row = Array.isArray(result) ? result[0] : result;

    // Never report Owner setup as successful unless the database confirms
    // the owner role AND the pharmacy membership in the same RPC response.
    if(!row || !row.pharmacy_id || row.system_role !== "owner" || row.member_role !== "admin"){
        throw new Error("Administrator setup was not completed by the database. No success state was saved.");
    }

    await loadPublicSetupStatus();
    if(!AuthState.ownerExists){
        throw new Error("Administrator verification failed. Please retry before continuing.");
    }

    localStorage.removeItem(AUTH_PENDING_OWNER_KEY);
    return row;
}

async function completeOwnerSetupFromPendingPanel(){
    if(AuthState.busy){ return; }
    const pharmacyName = valueOf("pendingOwnerPharmacyName").trim();
    const pharmacyCode = valueOf("pendingOwnerPharmacyCode").trim();
    if(!pharmacyName || pharmacyCode.length < 3){
        setAuthMessage("Enter pharmacy name and code.","error");
        return;
    }
    localStorage.setItem(AUTH_PENDING_OWNER_KEY,JSON.stringify({pharmacyName,pharmacyCode}));
    setAuthBusy(true,"Completing owner setup...");
    try{
        await completePendingOwnerSetup();
        await loadMyAppContext();
        renderAuthState();
        unlockApplicationAfterAuth();
    }
    catch(error){ setAuthMessage(error.message || "Owner setup failed.","error"); }
    finally{ setAuthBusy(false); }
}

async function redeemPendingInvite(){
    const token = normalizeInviteToken(localStorage.getItem(AUTH_PENDING_INVITE_KEY) || "");
    if(!token){ return false; }
    await authRpc("redeem_pharmacy_invite",{p_invite_token:token});
    localStorage.removeItem(AUTH_PENDING_INVITE_KEY);
    return true;
}

async function redeemInviteFromPendingPanel(){
    if(AuthState.busy){ return; }
    const token = normalizeInviteToken(valueOf("pendingInviteToken"));
    if(!token){ setAuthMessage("Enter the invitation code.","error"); return; }
    localStorage.setItem(AUTH_PENDING_INVITE_KEY,token);
    setAuthBusy(true,"Activating access...");
    try{
        await redeemPendingInvite();
        await loadMyAppContext();
        renderAuthState();
        if(hasApplicationAccess()){ unlockApplicationAfterAuth(); }
    }
    catch(error){ setAuthMessage(error.message || "Invitation activation failed.","error"); }
    finally{ setAuthBusy(false); }
}

function normalizeInviteToken(value){
    return String(value || "").trim().toLowerCase();
}

async function signOutCurrentUser(){
    if(typeof window.resetExpiryDesktopSession==="function")window.resetExpiryDesktopSession();
    clearRecoveryArtifacts();
    resetResponsiveSidebarAfterAuth();

    /* 2C.10.7.0 — a PC-owned live session must be ended while authentication
       still exists. Logging out first previously left the Handheld attached to
       an orphaned server session. Handheld sign-out still only detaches itself. */
    try{
        if(AppState?.session?.role==="PC" && AppState?.session?.cloud===true && typeof leaveCloudSession==="function"){
            const ended=await leaveCloudSession();
            if(ended===false){
                showToast("End the shared Handheld session before signing out","warning");
                return false;
            }
        }
    }catch(error){
        Logger?.error?.("Unable to end shared session before sign out",error);
        showToast(error?.message||"Unable to end shared session before sign out","error");
        return false;
    }

    const token = getSupabaseAccessToken();
    try{
        if(token){
            await authRequest("/auth/v1/logout",{
                method:"POST",
                headers:{"Authorization":"Bearer " + token},
                body:"{}"
            });
        }
    }
    catch(_){ }
    persistAuthSession(null);

    const previousScope=String(
        AuthState.lastContextScope || ""
    );

    AuthState.context = null;
    AuthState.contextError = null;
    AuthState.registration = null;
    AuthState.lastContextScope="";

    if(typeof PharmFlowCloudWorkspace!=="undefined"){
        if(typeof cancelPendingCloudWorkspaceSave==="function"){
            cancelPendingCloudWorkspaceSave();
        }

        PharmFlowCloudWorkspace.hydratedPharmacyId=null;
        PharmFlowCloudWorkspace.lastCloudUpdate=null;
        PharmFlowCloudWorkspace.lastAppliedWorkspaceSignature="";
        PharmFlowCloudWorkspace.generation=null;
        PharmFlowCloudWorkspace.activeAccountScope="";
        PharmFlowCloudWorkspace.hydrationPromise=null;
        PharmFlowCloudWorkspace.reconcilePromise=null;
    }

    if(
        typeof AppState!=="undefined" &&
        typeof createEmptyAccountContext==="function"
    ){
        AppState.account=createEmptyAccountContext();
        AppState.workspace=createEmptyWorkspace();
        AppState.session=createEmptySession();

        if(AppState.archive){
            AppState.archive.orders=[];
            AppState.archive.transactions=[];
        }

        resetStatistics?.();
        rebuildStateIndexes?.();
    }

    publishAuthenticatedContextReady(previousScope,"");

    lockApplicationForAuth();
    renderAuthState();
}

async function resumeAuthenticatedApp(){
    resetResponsiveSidebarAfterAuth();
    await loadPublicSetupStatus().catch(()=>{});
    if(!AuthState.session){
        lockApplicationForAuth();
        renderAuthState();
        return false;
    }
    try{
        await finishPendingAccessIfPossible();
        await loadMyAppContext();
        renderAuthState();
        if(hasApplicationAccess()){
            unlockApplicationAfterAuth();
            return true;
        }
        lockApplicationForAuth(false);
        return false;
    }
    catch(_){
        const refreshed = await refreshAuthToken();
        if(refreshed){
            await finishPendingAccessIfPossible().catch(()=>{});
            await loadMyAppContext();
            renderAuthState();
            if(hasApplicationAccess()){
                unlockApplicationAfterAuth();
                return true;
            }
        }
        lockApplicationForAuth();
        return false;
    }
}

async function ownerCreatePharmacyFromSettings(){
    if(AuthState.busy || !isSystemOwner()){ return; }
    const name = valueOf("ownerNewPharmacyName").trim();
    const code = valueOf("ownerNewPharmacyCode").trim();
    const email = valueOf("ownerNewPharmacyAdminEmail").trim();
    if(!name || code.length < 3 || !email){
        setSettingsAccessMessage("Enter pharmacy name, code and manager email.","error");
        return;
    }
    setAuthBusy(true);
    try{
        const rows = await authRpc("owner_create_pharmacy",{p_name:name,p_code:code,p_admin_email:email});
        const row = Array.isArray(rows) ? rows[0] : rows;
        setSettingsAccessMessage(
            "Pharmacy created. Share this invitation code with " + email + ": " + (row && row.invite_token || ""),
            "success"
        );
        setInputValue("ownerNewPharmacyName","");
        setInputValue("ownerNewPharmacyCode","");
        setInputValue("ownerNewPharmacyAdminEmail","");
    }
    catch(error){ setSettingsAccessMessage(error.message || "Unable to create pharmacy.","error"); }
    finally{ setAuthBusy(false); }
}



async function loadOwnerPharmacies(){
    if(!isSystemOwner()){ return []; }
    const rows = await authRpc("owner_list_pharmacies",{});
    AuthState.ownerPharmacies = Array.isArray(rows) ? rows : [];
    renderOwnerPharmacies();
    return AuthState.ownerPharmacies;
}

async function loadOwnerControlCenter(){
    if(!isSystemOwner()){ return; }
    try{
        await Promise.all([
            loadOwnerRegistrationRequests(false),
            loadOwnerPharmacies()
        ]);
        renderOwnerMetrics();
    }catch(error){
        setSettingsAccessMessage(error.message || "Unable to load Access Management.","error");
    }
}

function renderOwnerMetrics(){
    const pharmacies = AuthState.ownerPharmacies || [];
    const requests = AuthState.ownerRegistrations || [];
    setText("ownerMetricTotalPharmacies",String(pharmacies.length));
    setText("ownerMetricActivePharmacies",String(pharmacies.filter(p=>p.status === "active" && p.active !== false).length));
    setText("ownerMetricPendingRequests",String(requests.filter(r=>r.request_status === "pending").length));
    setText("ownerMetricSuspendedPharmacies",String(pharmacies.filter(p=>!(p.status === "active" && p.active !== false)).length));
}

function ownerPharmacyMatchesSearch(p,query){
    if(!query){ return true; }
    const haystack=[p.pharmacy_name,p.pharmacy_code,p.admin_email,p.pending_admin_email,p.admin_name]
        .map(value=>String(value||"").toLowerCase()).join(" ");
    return haystack.includes(query.toLowerCase());
}

function getOwnerPharmacyRowsForView(){
    const view=AuthState.ownerManagementView || "total";
    const query=String(AuthState.ownerManagementSearch||"").trim();
    return (AuthState.ownerPharmacies||[]).filter(p=>{
        const active=p.status==="active" && p.active!==false;
        if(view==="active" && !active){ return false; }
        if(view==="suspended" && active){ return false; }
        return ownerPharmacyMatchesSearch(p,query);
    });
}

function renderOwnerPharmacies(){
    const box=document.getElementById("ownerPharmacyList");
    if(!box){ return; }
    const rows=getOwnerPharmacyRowsForView();
    if(!rows.length){
        box.innerHTML='<div class="registrationEmpty">No pharmacies match this view.</div>';
        renderOwnerMetrics();
        return;
    }

    box.innerHTML=rows.map(p=>{
        const active=p.status==="active" && p.active!==false;
        const adminLabel=p.admin_email
            ? escapeAuthHtml(p.admin_email)
            : (p.pending_admin_email
                ? escapeAuthHtml(p.pending_admin_email)+' <span class="ownerAwaitingTag">Awaiting activation</span>'
                : '<span class="ownerUnassignedTag">No ADMIN assigned</span>');
        const adminName=p.admin_name ? `<small>${escapeAuthHtml(p.admin_name)}</small>` : "";

        return `<article class="ownerPharmacyCard">
            <div class="ownerPharmacyIdentity">
                <div class="ownerPharmacyCodeBadge">${escapeAuthHtml(p.pharmacy_code || "-")}</div>
                <strong class="ownerPharmacyName">${escapeAuthHtml(p.pharmacy_name || "Pharmacy")}</strong>
            </div>
            <div class="ownerPharmacyAdmin">
                <span class="ownerFieldLabel">ADMIN</span>
                <div>${adminLabel}</div>
                ${adminName}
            </div>
            <div class="ownerPharmacyActions">
                <span class="ownerPharmacyState ${active ? "active" : "suspended"}">${active ? "ACTIVE" : "SUSPENDED"}</span>
                <button type="button" class="secondaryButton" data-owner-action="identity" data-pharmacy-id="${escapeAuthHtml(p.pharmacy_id)}" data-pharmacy-code="${escapeAuthHtml(p.pharmacy_code || "")}" data-pharmacy-name="${escapeAuthHtml(p.pharmacy_name || "")}">Edit</button>
                <button type="button" class="secondaryButton" data-owner-action="admin" data-pharmacy-id="${escapeAuthHtml(p.pharmacy_id)}" data-pharmacy-code="${escapeAuthHtml(p.pharmacy_code || "")}">Admin</button>
                ${p.admin_user_id ? `<button type="button" class="secondaryButton" data-owner-action="reset-password" data-pharmacy-id="${escapeAuthHtml(p.pharmacy_id)}" data-admin-user-id="${escapeAuthHtml(p.admin_user_id)}">Reset</button>` : ""}
                <button type="button" class="secondaryButton" data-owner-action="${active ? "suspend" : "activate"}" data-pharmacy-id="${escapeAuthHtml(p.pharmacy_id)}">${active ? "Suspend" : "Activate"}</button>
            </div>
        </article>`;
    }).join("");

    box.querySelectorAll("[data-owner-action]").forEach(btn=>{
        btn.addEventListener("click",()=>handleOwnerPharmacyAction(btn));
    });
    renderOwnerMetrics();
}

function openOwnerManagementPanel(view){
    if(!["total","active","pending","suspended"].includes(view)){ return; }
    AuthState.ownerManagementView=view;
    AuthState.ownerManagementSearch="";
    const search=document.getElementById("ownerManagementSearch");
    if(search){ search.value=""; }
    setOwnerManagementMessage("","");
    renderOwnerManagementPanel();

}

function closeOwnerManagementPanel(){
    AuthState.ownerManagementView=null;
    AuthState.ownerManagementSearch="";
    const panel=document.getElementById("ownerManagementPanel");
    if(panel){ panel.classList.remove("open"); panel.setAttribute("aria-hidden","true"); }
}

function renderOwnerManagementPanel(){
    const panel=document.getElementById("ownerManagementPanel");
    const pharmacyList=document.getElementById("ownerPharmacyList");
    const requests=document.getElementById("ownerRegistrationRequests");
    const searchWrap=document.getElementById("ownerManagementSearchWrap");
    if(!panel || !pharmacyList || !requests){ return; }
    const view=AuthState.ownerManagementView;
    if(!view){
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden","true");
        return;
    }
    const config={
        total:["PHARMACY ACCESS","All Pharmacies","Manage every pharmacy and its ADMIN access."],
        active:["PHARMACY ACCESS","Active Pharmacies","Manage pharmacies that currently have active access."],
        pending:["NEW PHARMACIES","Pending Registration Requests","Review new accounts, confirm the official pharmacy identity, then approve or reject access."],
        suspended:["PHARMACY ACCESS","Suspended Pharmacies","Manage pharmacies whose access is currently suspended."]
    }[view];
    setText("ownerManagementEyebrow",config[0]);
    setText("ownerManagementTitle",config[1]);
    setText("ownerManagementDescription",config[2]);
    panel.classList.add("open");
    panel.setAttribute("aria-hidden","false");
    const pending=view==="pending";
    requests.hidden=!pending;
    pharmacyList.hidden=pending;
    if(searchWrap){ searchWrap.hidden=pending; }
    if(pending){ renderOwnerRegistrationRequests(); }
    else{ renderOwnerPharmacies(); }
}
function setSettingsPasswordMessage(message,type){
    const el=document.getElementById("settingsPasswordMessage");
    if(!el){ return; }
    el.textContent=message||"";
    el.className="authMessage "+(type||"");
}

function clearSettingsPasswordFields(){
    ["settingsCurrentPassword","settingsNewPassword","settingsConfirmPassword"].forEach(id=>setInputValue(id,""));
}

function openSettingsPasswordPanel(){
    if(!AuthState.session || !AuthState.user?.email){ return; }
    const overlay=document.getElementById("settingsPasswordOverlay");
    if(!overlay){ return; }
    clearSettingsPasswordFields();
    setSettingsPasswordMessage("","");
    overlay.hidden=false;
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden","false");
    document.getElementById("settingsCurrentPassword")?.focus();
}

function closeSettingsPasswordPanel(){
    const overlay=document.getElementById("settingsPasswordOverlay");
    if(!overlay){ return; }
    overlay.classList.remove("open");
    overlay.hidden=true;
    overlay.setAttribute("aria-hidden","true");
    clearSettingsPasswordFields();
    setSettingsPasswordMessage("","");
}

async function changeSettingsPassword(){
    if(AuthState.busy || !AuthState.session || !AuthState.user?.email){ return; }
    const currentPassword=valueOf("settingsCurrentPassword");
    const newPassword=valueOf("settingsNewPassword");
    const confirmPassword=valueOf("settingsConfirmPassword");
    if(!currentPassword){
        setSettingsPasswordMessage("Enter your current password.","error");
        return;
    }
    if(newPassword.length<8 || newPassword!==confirmPassword){
        setSettingsPasswordMessage("Enter matching new passwords of at least 8 characters.","error");
        return;
    }
    if(newPassword===currentPassword){
        setSettingsPasswordMessage("Choose a new password different from your current password.","error");
        return;
    }

    setAuthBusy(true,"Updating password...");
    try{
        // Re-authenticate with the current password first. The returned session
        // proves knowledge of the current credential and is not persisted unless
        // verification succeeds.
        const verifiedSession=await authRequest("/auth/v1/token?grant_type=password",{
            method:"POST",
            body:JSON.stringify({email:AuthState.user.email,password:currentPassword})
        });
        const verificationToken=verifiedSession?.access_token;
        if(!verificationToken){ throw new Error("Current password could not be verified."); }

        const updatedUser=await authRequest("/auth/v1/user",{
            method:"PUT",
            headers:{"Authorization":"Bearer "+verificationToken},
            body:JSON.stringify({password:newPassword})
        });

        // Keep the freshly authenticated session authoritative after password
        // rotation, updating its user payload when GoTrue returns one.
        verifiedSession.user=updatedUser?.user || updatedUser || verifiedSession.user;
        persistAuthSession(verifiedSession);
        closeSettingsPasswordPanel();
        showToast("Password updated successfully","success");
    }catch(error){
        setSettingsPasswordMessage(
            /invalid login|invalid credentials/i.test(String(error?.message||""))
                ? "Current password is incorrect."
                : (error.message || "Unable to update password."),
            "error"
        );
    }finally{ setAuthBusy(false); }
}

function setSettingsIdentityEditMode(editing){
    const view=document.getElementById("settingsIdentityView");
    const panel=document.getElementById("settingsIdentityEdit");
    if(!view || !panel){ return; }
    const allowed=!!editing && isSystemOwner() && !!AuthState.context?.pharmacy_id;
    view.classList.toggle("hidden",allowed);
    panel.classList.toggle("hidden",!allowed);
    panel.setAttribute("aria-hidden",allowed ? "false" : "true");
    if(allowed){
        setInputValue("settingsIdentityNameInput",AuthState.context?.pharmacy_name || "");
        setInputValue("settingsIdentityCodeInput",AuthState.context?.pharmacy_code || "");
        const codeInput=document.getElementById("settingsIdentityCodeInput");
        const protectedReference=String(AuthState.context?.pharmacy_code||"").trim().toUpperCase()==="HHP084";
        if(codeInput){
            codeInput.disabled=protectedReference;
            codeInput.title=protectedReference ? "HHP084 is the protected reference pharmacy code." : "";
        }
        document.getElementById("settingsIdentityNameInput")?.focus();
    }
}

async function saveSettingsIdentity(){
    if(AuthState.busy || !isSystemOwner() || !AuthState.context?.pharmacy_id){ return; }
    const pharmacyName=valueOf("settingsIdentityNameInput").trim();
    const pharmacyCode=valueOf("settingsIdentityCodeInput").trim();
    if(String(AuthState.context?.pharmacy_code||"").trim().toUpperCase()==="HHP084" && pharmacyCode.toUpperCase()!=="HHP084"){
        setSettingsAccessMessage("HHP084 is the protected reference pharmacy code and cannot be changed.","error");
        return;
    }
    if(!pharmacyName || pharmacyCode.length<3){
        setSettingsAccessMessage("Pharmacy Name and a valid Pharmacy Code are required.","error");
        return;
    }
    if(pharmacyName===AuthState.context.pharmacy_name && pharmacyCode.toUpperCase()===String(AuthState.context.pharmacy_code||"").toUpperCase()){
        setSettingsIdentityEditMode(false);
        return;
    }
    if(!window.confirm("Update this pharmacy identity? Existing Orders, Receiving and history remain attached to the same pharmacy.")){ return; }
    setAuthBusy(true);
    try{
        await authRpc("owner_update_pharmacy_identity_v1",{
            p_pharmacy_id:AuthState.context.pharmacy_id,
            p_official_pharmacy_name:pharmacyName,
            p_official_pharmacy_code:pharmacyCode
        });
        await loadMyAppContext();
        await loadOwnerPharmacies();
        setSettingsIdentityEditMode(false);
        renderAuthState();
        setSettingsAccessMessage("Pharmacy identity updated. Operational history was preserved.","success");
    }catch(error){
        setSettingsAccessMessage(error.message || "Unable to update pharmacy identity.","error");
    }finally{ setAuthBusy(false); }
}

async function handleOwnerPharmacyAction(button){
    if(!isSystemOwner() || !button){ return; }
    const pharmacyId = button.dataset.pharmacyId;
    const action = button.dataset.ownerAction;
    if(!pharmacyId){ return; }

    if(action === "reset-password"){
        const targetUserId=button.dataset.adminUserId;
        if(!targetUserId){ return; }
        if(!window.confirm("Create a one-time temporary password for this pharmacy ADMIN?")){ return; }
        setAuthBusy(true);
        try{
            const result=await callPasswordAdmin({action:"reset",target_user_id:targetUserId});
            const temporaryPassword=String(result.temporary_password||"");
            window.prompt("Temporary password — copy and send it securely. The ADMIN must replace it at first sign-in:",temporaryPassword);
            setOwnerManagementMessage("Temporary password created. No email was sent.","success");
        }catch(error){
            setOwnerManagementMessage(error.message || "Unable to reset password.","error");
        }finally{ setAuthBusy(false); }
        return;
    }

    if(action === "identity"){
        const currentName = button.dataset.pharmacyName || "";
        const currentCode = button.dataset.pharmacyCode || "";
        const newName = window.prompt("Official Pharmacy Name:", currentName);
        if(newName === null){ return; }
        const newCode = window.prompt("Official Pharmacy Code:", currentCode);
        if(newCode === null){ return; }
        if(!String(newName).trim() || String(newCode).trim().length < 3){
            setSettingsAccessMessage("Pharmacy Name and a valid Pharmacy Code are required.","error");
            return;
        }
        if(!window.confirm("Update this pharmacy identity? Existing Orders, Receiving and history remain attached to the same pharmacy.")){ return; }
        setAuthBusy(true);
        try{
            await authRpc("owner_update_pharmacy_identity_v1",{
                p_pharmacy_id:pharmacyId,
                p_official_pharmacy_name:String(newName).trim(),
                p_official_pharmacy_code:String(newCode).trim()
            });
            await loadOwnerPharmacies();
            if(AuthState.context?.pharmacy_id === pharmacyId){ await loadMyAppContext(); renderAuthState(); }
            setSettingsAccessMessage("Pharmacy identity updated. Operational history was preserved.","success");
        }catch(error){
            setSettingsAccessMessage(error.message || "Unable to update pharmacy identity.","error");
        }finally{ setAuthBusy(false); }
        return;
    }

    if(action === "admin"){
        const pharmacy = (AuthState.ownerPharmacies || []).find(p=>String(p.pharmacy_id) === String(pharmacyId));
        const currentAdminEmail = pharmacy?.admin_email || pharmacy?.pending_admin_email || "";
        const email = window.prompt("ADMIN email for this pharmacy:", currentAdminEmail);
        if(email === null){ return; }
        const cleanEmail = String(email).trim().toLowerCase();
        if(!cleanEmail || !cleanEmail.includes("@")){
            setSettingsAccessMessage("Enter a valid ADMIN email.","error");
            return;
        }
        if(!window.confirm("Assign " + cleanEmail + " as the single pharmacy ADMIN?")){ return; }

        setAuthBusy(true);
        try{
            const rows = await authRpc("owner_assign_pharmacy_admin",{
                p_pharmacy_id:pharmacyId,
                p_email:cleanEmail
            });
            const row = Array.isArray(rows) ? rows[0] : rows;
            await loadOwnerPharmacies();
            setSettingsAccessMessage(
                row && row.assignment_status === "active"
                    ? "ADMIN linked successfully."
                    : "ADMIN email assigned. The account must be created through the approved registration flow.",
                "success"
            );
        }catch(error){
            setSettingsAccessMessage(error.message || "Unable to assign ADMIN.","error");
        }finally{
            setAuthBusy(false);
        }
        return;
    }

    const nextStatus = action === "suspend" ? "suspended" : "active";
    const question = nextStatus === "suspended"
        ? "Suspend this pharmacy? Its ADMIN will lose application access until you reactivate it."
        : "Reactivate this pharmacy?";
    if(!window.confirm(question)){ return; }

    setAuthBusy(true);
    try{
        await authRpc("owner_set_pharmacy_status",{
            p_pharmacy_id:pharmacyId,
            p_status:nextStatus
        });
        await loadOwnerPharmacies();
        setSettingsAccessMessage(nextStatus === "active" ? "Pharmacy activated." : "Pharmacy suspended.","success");
    }catch(error){
        setSettingsAccessMessage(error.message || "Unable to update pharmacy status.","error");
    }finally{
        setAuthBusy(false);
    }
}

async function loadOwnerRegistrationRequests(showMessage=false){
    if(!isSystemOwner()){ return []; }
    try{
        const rows = await authRpc("owner_list_pharmacy_registrations",{p_status:null});
        AuthState.ownerRegistrations = Array.isArray(rows) ? rows : [];
        renderOwnerRegistrationRequests();
        renderOwnerMetrics();
        if(AuthState.ownerManagementView==="pending"){ renderOwnerManagementPanel(); }
        if(showMessage){ setSettingsAccessMessage("Registration requests refreshed.","success"); }
        return AuthState.ownerRegistrations;
    }
    catch(error){
        if(showMessage){ setSettingsAccessMessage(error.message || "Unable to load requests.","error"); }
        return [];
    }
}

function renderOwnerRegistrationRequests(){
    const box = document.getElementById("ownerRegistrationRequests");
    if(!box){ return; }
    const rows = (AuthState.ownerRegistrations || []).filter(r=>r.request_status === "pending");
    if(!rows.length){
        box.innerHTML = '<div class="registrationEmpty">No pending registration requests.</div>';
        return;
    }
    box.innerHTML = rows.map(r=>`<article class="registrationRequestCard">
        <div class="registrationRequestTop">
            <div><strong>${escapeAuthHtml(r.applicant_email || "New account")}</strong><span>Requested code: ${escapeAuthHtml(r.pharmacy_code || "-")}</span></div>
            <span class="registrationStatus pending">PENDING</span>
        </div>
        <div class="registrationMeta"><span>${escapeAuthHtml(formatAuthDate(r.submitted_at))}</span></div>
        <div class="registrationApprovalFields">
            <label>Official Pharmacy Name<input type="text" data-reg-name="${escapeAuthHtml(r.request_id)}" maxlength="120" placeholder="Pharmacy name"></label>
            <label>Official Pharmacy Code<input type="text" data-reg-code="${escapeAuthHtml(r.request_id)}" maxlength="24" value="${escapeAuthHtml(r.pharmacy_code || "")}"></label>
        </div>
        <div class="registrationActions">
            <button type="button" class="secondaryButton" data-reg-action="reject" data-reg-id="${escapeAuthHtml(r.request_id)}">Reject</button>
            <button type="button" class="primaryButton" data-reg-action="approve" data-reg-id="${escapeAuthHtml(r.request_id)}">Approve & Activate</button>
        </div>
    </article>`).join("");
    box.querySelectorAll("[data-reg-action]").forEach(btn=>{
        btn.addEventListener("click",()=>reviewRegistration(btn.dataset.regId,btn.dataset.regAction));
    });
}

async function reviewRegistration(requestId,decision){
    if(!isSystemOwner() || !requestId){ return; }
    const approve = decision === "approve";
    const nameInput = document.querySelector('[data-reg-name="' + CSS.escape(requestId) + '"]');
    const codeInput = document.querySelector('[data-reg-code="' + CSS.escape(requestId) + '"]');
    const officialName = approve ? String(nameInput?.value || "").trim() : null;
    const officialCode = approve ? String(codeInput?.value || "").trim() : null;
    if(approve && (!officialName || officialCode.length < 3)){
        setSettingsAccessMessage("Enter the official Pharmacy Name and Pharmacy Code before approval.","error");
        return;
    }
    if(!window.confirm(approve ? "Approve and activate this pharmacy with the official identity shown?" : "Reject this pharmacy registration request?")){ return; }
    setAuthBusy(true);
    try{
        await authRpc("owner_review_pharmacy_registration_v2",{
            p_request_id:requestId,
            p_decision:decision,
            p_official_pharmacy_name:officialName,
            p_official_pharmacy_code:officialCode,
            p_note:null
        });
        await loadOwnerControlCenter(false);
        setSettingsAccessMessage(approve ? "Pharmacy approved and activated." : "Registration rejected.","success");
    }catch(error){
        setSettingsAccessMessage(error.message || "Unable to review registration.","error");
    }finally{ setAuthBusy(false); }
}

function escapeAuthHtml(value){
    return String(value == null ? "" : value)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
        .replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
}

function formatAuthDate(value){
    if(!value){ return "-"; }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

async function createMemberInviteFromSettings(){
    if(AuthState.busy || !AuthState.context || !AuthState.context.pharmacy_id){ return; }
    const email = valueOf("memberInviteEmail").trim();
    const requestedRole = valueOf("memberInviteRole") || "staff";
    const role = isSystemOwner() ? requestedRole : "staff";
    if(!email){ setSettingsAccessMessage("Enter staff email.","error"); return; }
    setAuthBusy(true);
    try{
        const rows = await authRpc("create_pharmacy_member_invite",{
            p_pharmacy_id:AuthState.context.pharmacy_id,
            p_email:email,
            p_role:role
        });
        const row = Array.isArray(rows) ? rows[0] : rows;
        setSettingsAccessMessage(
            "Invitation created for " + email + ". Share this code: " + (row && row.invite_token || ""),
            "success"
        );
        setInputValue("memberInviteEmail","");
    }
    catch(error){ setSettingsAccessMessage(error.message || "Unable to create invitation.","error"); }
    finally{ setAuthBusy(false); }
}

function isSystemOwner(){
    return !!(AuthState.context && AuthState.context.system_role === "owner");
}

function isPharmacyAdmin(){
    return isSystemOwner() || !!(AuthState.context && AuthState.context.member_role === "admin");
}

function renderAuthState(){
    if(AuthState.mustChangePassword && AuthState.session){
        finishAuthBootState();
        lockApplicationForAuth(true);
        showForcedPasswordPanel();
        return;
    }
    if(AuthState.recoveryActive || window.__MEDRYVO_RECOVERY_ACTIVE){
        finishAuthBootState();
        lockApplicationForAuth(true);
        showAuthPanel("recovery",{history:"replace"});
        return;
    }
    const overlay = document.getElementById("authGate");
    const accessPanel = document.getElementById("authAccessPanel");
    const formsPanel = document.getElementById("authFormsPanel");
    const account = AuthState.context;

    /*
       DEVISO3: allow the development environment to render an explicit
       fail-closed access screen instead of exposing another tenant or
       mislabeling it as an unassigned pharmacy account.
    */
    if(
        AuthState.session &&
        account &&
        typeof window.pharmFlowDevRenderAccessBoundary === "function" &&
        window.pharmFlowDevRenderAccessBoundary(account) === true
    ){
        return;
    }

    if(typeof window.pharmFlowDevHideAccessBoundary === "function"){
        window.pharmFlowDevHideAccessBoundary();
    }

    if(AuthState.session && AuthState.contextLoading){
        return;
    }

    finishAuthBootState();

    /* A failed context request is not proof that this account has no
       pharmacy. Reserve Complete access for a successful empty response. */
    if(AuthState.session && AuthState.contextError && !account){
        if(overlay){ overlay.classList.add("visible"); }
        if(formsPanel){ formsPanel.hidden = false; }
        if(accessPanel){ accessPanel.hidden = true; }
        showAuthPanel("login");
        setAuthMessage(
            "We could not verify your pharmacy access. Check the connection, then sign in again.",
            "error"
        );
        return;
    }

    if(!AuthState.session){
        clearSensitiveAuthFields();
        if(overlay){ overlay.classList.add("visible"); }
        if(formsPanel){ formsPanel.hidden = false; }
        if(accessPanel){ accessPanel.hidden = true; }
        showAuthPanel("login");
    }
    else if(!hasApplicationAccess()){
        if(overlay){ overlay.classList.add("visible"); }
        if(formsPanel){ formsPanel.hidden = true; }
        if(accessPanel){ accessPanel.hidden = false; }
        renderPendingAccessPanel();
    }
    else{
        if(overlay){ overlay.classList.remove("visible"); }
        if(accessPanel){ accessPanel.hidden = true; }
    }

    const roleText = account && account.system_role === "owner"
        ? "OWNER"
        : (account && account.member_role ? account.member_role.toUpperCase() : "");

    setText("accountPharmacyName",account && account.pharmacy_name || "Pharmacy");
    setText("accountUserName",account && (account.display_name || account.email) || "User");
    setText("accountUserRole",roleText);
    setText("dashboardPharmacyName",account && account.pharmacy_name || "Pharmacy");
    setText("dashboardPharmacyCode",account && account.pharmacy_code || "—");
    setText("dashboardUserRole",roleText || "USER");
    setText("settingsPharmacyName",account && account.pharmacy_name || "-");
    setText("settingsPharmacyCode",account && account.pharmacy_code || "-");
    setText("settingsSignedInUser",account && account.email || "-");
    setText("settingsUserRole",roleText || "-");

    const settingsEditButton = document.getElementById("btnEditSettingsIdentity");
    if(settingsEditButton){ settingsEditButton.hidden = !isSystemOwner() || !account?.pharmacy_id; }
    if(!isSystemOwner()){ setSettingsIdentityEditMode(false); }

    const ownerCard = document.getElementById("ownerManagementCard");
    if(ownerCard){ ownerCard.hidden = !isSystemOwner(); }
    if(isSystemOwner()){ loadOwnerControlCenter(false).catch(()=>{}); }

    // Current PharmFlow access model: one ADMIN per pharmacy, no staff invitations.
    const memberCard = document.getElementById("memberInviteCard");
    if(memberCard){ memberCard.hidden = true; }

    const ownerButton = document.getElementById("btnAuthShowOwnerSetup");
    if(ownerButton){ ownerButton.hidden = AuthState.ownerExists; }
}

function renderPendingAccessPanel(){
    const ownerSetup = document.getElementById("pendingOwnerSetupBox");
    const standardSetup = document.getElementById("pendingStandardAccessBox");
    const registrationStatus = document.getElementById("pendingRegistrationStatusBox");
    if(ownerSetup){ ownerSetup.hidden = AuthState.ownerExists; }
    if(standardSetup){ standardSetup.hidden = !AuthState.ownerExists || !!AuthState.registration; }
    if(registrationStatus){ registrationStatus.hidden = !AuthState.ownerExists || !AuthState.registration; }
    setText("pendingAccessEmail",AuthState.user && AuthState.user.email || "Signed-in account");
    if(AuthState.registration){
        const r = AuthState.registration;
        setText("pendingRegistrationPharmacy",r.pharmacy_name || "-");
        setText("pendingRegistrationCode",r.pharmacy_code || "-");
        setText("pendingRegistrationStatus",String(r.request_status || "pending").toUpperCase());
        setText("pendingRegistrationNote",r.review_note || (r.request_status === "pending" ? "Waiting for approval." : ""));
    }
}

async function callPasswordAdmin(payload){
    const response = await fetch(getSupabaseProjectUrl() + "/functions/v1/pharmflow-password-admin",{
        method:"POST",
        headers:{
            "Content-Type":"application/json",
            "apikey":getSupabasePublishableKey(),
            "Authorization":"Bearer " + getSupabaseAccessToken()
        },
        body:JSON.stringify(payload)
    });
    const data = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error || "Password operation failed");
    return data;
}

function showForcedPasswordPanel(){
    const formsPanel=document.getElementById("authFormsPanel");
    const accessPanel=document.getElementById("authAccessPanel");
    if(formsPanel){ formsPanel.hidden=false; }
    if(accessPanel){ accessPanel.hidden=true; }
    ["authLoginForm","authPublicSignupForm","authInviteSignupForm","authOwnerSignupForm","authRecoveryForm"].forEach(id=>{
        const el=document.getElementById(id); if(el){ el.hidden=true; }
    });
    let form=document.getElementById("authForcedPasswordForm");
    if(!form){
        const template=document.getElementById("authForcedPasswordTemplate");
        if(template&&formsPanel){ formsPanel.appendChild(template.content.cloneNode(true)); }
        form=document.getElementById("authForcedPasswordForm");
        bindClick("btnAuthForcedPasswordSave",()=>completeTemporaryPassword());
    }
    if(form){ form.hidden=false; }
    setAuthMessage("","");
}

async function completeTemporaryPassword(){
    if(AuthState.busy){ return; }
    const password=valueOf("authForcedPassword");
    const confirm=valueOf("authForcedPasswordConfirm");
    if(password.length<8 || password!==confirm){
        setAuthMessage("Enter matching passwords of at least 8 characters.","error");
        return;
    }
    setAuthBusy(true,"Saving new password...");
    try{
        await callPasswordAdmin({action:"complete",new_password:password});
        AuthState.mustChangePassword=false;
        if(AuthState.user?.app_metadata){ AuthState.user.app_metadata.pharmflow_must_change_password=false; }
        if(AuthState.session?.user?.app_metadata){ AuthState.session.user.app_metadata.pharmflow_must_change_password=false; }
        persistAuthSession(AuthState.session);
        await loadMyAppContext();
        renderAuthState();
        unlockApplicationAfterAuth();
        setAuthMessage("Password updated successfully.","success");
    }catch(error){
        setAuthMessage(error.message || "Unable to update password.","error");
    }finally{ setAuthBusy(false); }
}

function showAuthPanel(mode, options = {}){
    if(mode === "recovery" && (!AuthState.recoveryActive || !document.body.classList.contains("medryvoRecoveryMode"))){
        mode = "login";
    }

    const validMode = ["login","owner","public","recovery"].includes(mode) ? mode : "login";

    const login = document.getElementById("authLoginForm");
    const invite = document.getElementById("authInviteSignupForm");
    const owner = document.getElementById("authOwnerSignupForm");
    const publicSignup = document.getElementById("authPublicSignupForm");
    const recovery = validMode === "recovery" && AuthState.recoveryActive
        ? mountRecoveryForm()
        : document.getElementById("authRecoveryForm");
    const forcedPassword = document.getElementById("authForcedPasswordForm");

    if(login){ login.hidden = validMode !== "login"; }
    if(invite){ invite.hidden = validMode !== "invite"; }
    if(owner){ owner.hidden = validMode !== "owner"; }
    if(publicSignup){ publicSignup.hidden = validMode !== "public"; }
    if(recovery){ recovery.hidden = validMode !== "recovery"; }
    if(forcedPassword){ forcedPassword.hidden = true; }

    const panel = document.querySelector(".authFormPanelInner");
    if(panel){ panel.scrollTop = 0; }

    syncAuthHistory(validMode, options.history || "push");
    setAuthMessage("","");
}

function setAuthBusy(busy, message){
    AuthState.busy = busy;
    document.querySelectorAll("#authGate button, #authGate input, #authGate select").forEach(el=>{
        el.disabled = busy;
    });
    if(message){ setAuthMessage(message,"info"); }
}

function setAuthMessage(message,type){
    const el = document.getElementById("authMessage");
    if(!el){ return; }
    el.textContent = message || "";
    el.className = "authMessage " + (type || "");
}

function setSettingsAccessMessage(message,type){
    const el = document.getElementById("settingsAccessMessage");
    if(!el){ return; }
    el.textContent = message || "";
    el.className = "authMessage " + (type || "");
}

function setOwnerManagementMessage(message,type){
    const el=document.getElementById("ownerManagementMessage");
    if(!el){ return; }
    el.textContent=message || "";
    el.className="authMessage ownerControlMessage " + (type || "");
    el.setAttribute("role",type === "error" ? "alert" : "status");
    el.setAttribute("aria-live",type === "error" ? "assertive" : "polite");
}

function valueOf(id){
    const el = document.getElementById(id);
    return el ? String(el.value || "") : "";
}

function setInputValue(id,value){
    const el = document.getElementById(id);
    if(el){ el.value = value == null ? "" : value; }
}

function setText(id,value){
    const el = document.getElementById(id);
    if(el){ el.textContent = value; }
}


function resetResponsiveSidebarAfterAuth(){
    try{
        if(typeof closeMobileSidebar === "function"){
            closeMobileSidebar();
        }
    }catch(_){}

    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");

    if(sidebar){ sidebar.classList.remove("show"); }
    if(overlay){ overlay.classList.remove("show"); }

    if(typeof AppState !== "undefined" && AppState.ui){
        AppState.ui.sidebarOpen = false;
    }
}

function lockApplicationForAuth(showLogin = true){
    document.body.classList.add("authLocked");
    if(showLogin){
        const overlay = document.getElementById("authGate");
        if(overlay){ overlay.classList.add("visible"); }
    }
}


function openDashboardAfterAuthentication(){
    try{
        if(typeof AppState !== "undefined" && AppState.ui){
            if("currentPage" in AppState.ui){ AppState.ui.currentPage = "dashboard"; }
            if("activePage" in AppState.ui){ AppState.ui.activePage = "dashboard"; }
        }
        localStorage.removeItem("prs_last_page");
        localStorage.removeItem("medryvo_last_page");
        sessionStorage.removeItem("prs_last_page");
        sessionStorage.removeItem("medryvo_last_page");
    }catch(_){}
    try{
        if(typeof navigateTo === "function"){
            navigateTo("dashboard");
            return;
        }
    }catch(_){}

    try{
        if(typeof showPage === "function"){
            showPage("dashboard");
            return;
        }
    }catch(_){}

    try{
        if(typeof Router !== "undefined" && Router && typeof Router.navigate === "function"){
            Router.navigate("dashboard");
            return;
        }
    }catch(_){}

    // Fallback for the current SPA hash/page-state pattern.
    try{
        if(window.location.hash && window.location.hash !== "#dashboard"){
            history.replaceState(history.state || {}, "", window.location.pathname + window.location.search + "#dashboard");
        }
    }catch(_){}
}

function unlockApplicationAfterAuth(){
    if(AuthState.recoveryActive || window.__MEDRYVO_RECOVERY_ACTIVE){
        finishAuthBootState();
        lockApplicationForAuth(true);
        showAuthPanel("recovery",{history:"replace"});
        return;
    }

    /* The authenticated shell must remain covered until app.js completes
       authoritative workspace hydration. This is render orchestration only:
       session, account context, and sync behavior remain untouched. */
    document.body.classList.add("workspaceBooting");
    finishAuthBootState();

    // A sidebar drawer can remain open behind the auth screen after Sign Out.
    // If it survives the next Sign In, its backdrop covers the application and
    // makes the main content look frozen while the sidebar remains interactive.
    resetResponsiveSidebarAfterAuth();
    document.body.classList.remove("authLocked");
    const overlay = document.getElementById("authGate");
    if(overlay){ overlay.classList.remove("visible"); }

    /* B10 Clean15.2 — Handheld boot must not expose the desktop Dashboard
       with placeholder zero KPIs while Active Order authority is hydrating.
       Boot the protected app first, then route Handhelds directly to their
       dedicated mode surface. Desktop keeps the existing Dashboard route. */
    const handheld = typeof isLikelyZebraDevice === "function" && isLikelyZebraDevice();
    if(!handheld){
        openDashboardAfterAuthentication();
    }

    if(typeof window.bootProtectedApplication === "function"){
        window.bootProtectedApplication();
    }
    else if(typeof refreshEntireUI === "function"){
        refreshEntireUI();
    }

    if(handheld){
        try{
            /* Handheld auth resume is state-preserving. Background token/context
               refresh during a scan must never route an active worker away from
               Receiving. Initialize the Handheld shell once, then restore the
               mode that was active before authentication resumed. */
            const wasReceiving=document.body.classList.contains("zebraReceivingActive");
            const wasExpiry=document.body.classList.contains("zebraExpiryActive");
            const handheldInitialized=!!document.getElementById("zebraHome");

            if(!handheldInitialized){
                initializeZebraInterface?.();
            }

            if(wasReceiving){
                setZebraReceivingMode?.();
            }else if(wasExpiry){
                setZebraExpiryMode?.();
            }else if(!handheldInitialized){
                setZebraHomeMode?.();
            }
        }catch(error){
            Logger?.warn?.("Unable to restore Handheld workspace surface",error);
        }
    }
}
