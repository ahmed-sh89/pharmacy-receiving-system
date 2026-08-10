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

const AuthState = {
    initialized:false,
    recoveryActive:false,
    session:null,
    user:null,
    context:null,
    contextLoading:false,
    ownerExists:true,
    refreshTimer:null,
    busy:false,
    registration:null,
    ownerRegistrations:[]
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
    if(recoveryError){ return; }

    const recoveryMode = parseRecoverySessionFromUrl();
    if(recoveryMode){ return; }

    restoreAuthSession();
    await loadPublicSetupStatus().catch(()=>{});
    renderAuthState();
}

function bindAuthUI(){
    bindClick("btnAuthSignIn", ()=>signInFromForm());
    bindClick("btnAuthShowLogin", ()=>showAuthPanel("login"));
    bindClick("btnAuthShowLoginFromOwner", ()=>showAuthPanel("login"));
    bindClick("btnAuthShowInviteSignup", ()=>showAuthPanel("invite"));
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
    bindClick("btnOwnerCreatePharmacy", ()=>ownerCreatePharmacyFromSettings());
    bindClick("btnRefreshRegistrationRequests", ()=>loadOwnerRegistrationRequests(true));
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
    if(AuthState.busy){ return; }
    const email = valueOf("authEmail").trim();
    if(!email){
        setAuthMessage("Enter your email address first.","error");
        return;
    }
    setAuthBusy(true,"Sending password reset email...");
    try{
        // Supabase Auth expects redirect_to on the /recover request URL, not in the JSON body.
        const redirectTo = MEDRYVO_RECOVERY_REDIRECT;
        const recoverPath = "/auth/v1/recover?redirect_to=" + encodeURIComponent(redirectTo);
        await authRequest(recoverPath,{
            method:"POST",
            body:JSON.stringify({email})
        });
        setAuthMessage("Password reset email sent. Open the newest message and follow the link.","success");
    }
    catch(error){ setAuthMessage(error.message || "Unable to send password reset email.","error"); }
    finally{ setAuthBusy(false); }
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
    if(session){
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
        scheduleTokenRefresh(session);
    }
    else{
        localStorage.removeItem(AUTH_STORAGE_KEY);
        if(AuthState.refreshTimer){ clearTimeout(AuthState.refreshTimer); }
        AuthState.refreshTimer = null;
    }
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
    const response = await fetch(getSupabaseProjectUrl() + path, {...options, headers});
    const text = await response.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; }
    catch(_){ data = text; }
    if(!response.ok){
        throw new Error(
            (data && (data.msg || data.message || data.error_description || data.error || data.hint)) ||
            ("Authentication request failed (" + response.status + ")")
        );
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
    const token = getSupabaseAccessToken();
    if(!token){ throw new Error("Please sign in first"); }
    return authRequest("/rest/v1/rpc/" + encodeURIComponent(functionName), {
        method:"POST",
        headers:{"Authorization":"Bearer " + token,"Accept":"application/json"},
        body:JSON.stringify(params || {})
    });
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
    const name = valueOf("publicSignupName").trim();
    const email = valueOf("publicSignupEmail").trim();
    const password = valueOf("publicSignupPassword");
    const pharmacyName = valueOf("publicPharmacyName").trim();
    const pharmacyCode = valueOf("publicPharmacyCode").trim();
    if(!email || password.length < 6 || !pharmacyName || pharmacyCode.length < 3){
        setAuthMessage("Enter your details, pharmacy name/code, and a password of at least 6 characters.","error");
        return;
    }
    localStorage.setItem(AUTH_PENDING_REGISTRATION_KEY,JSON.stringify({
        pharmacyName, pharmacyCode, applicantName:name
    }));
    setAuthBusy(true,"Creating account...");
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
            await submitPendingRegistration();
            await loadMyAppContext();
            await loadMyRegistrationStatus();
            renderAuthState();
        }
        else{
            setAuthMessage("Account created. Confirm the email if requested, then sign in. Your pharmacy request will be submitted after sign-in.","success");
            showAuthPanel("login");
            setInputValue("authEmail",email);
        }
    }
    catch(error){ setAuthMessage(error.message || "Unable to create account.","error"); }
    finally{ setAuthBusy(false); }
}

async function submitPendingRegistration(){
    const raw = localStorage.getItem(AUTH_PENDING_REGISTRATION_KEY);
    if(!raw){ return false; }
    const setup = JSON.parse(raw);
    await authRpc("submit_pharmacy_registration",{
        p_pharmacy_name:setup.pharmacyName,
        p_pharmacy_code:setup.pharmacyCode,
        p_applicant_name:setup.applicantName || null
    });
    localStorage.removeItem(AUTH_PENDING_REGISTRATION_KEY);
    await loadMyRegistrationStatus().catch(()=>{});
    return true;
}

async function submitRegistrationFromPendingPanel(){
    if(AuthState.busy){ return; }
    const pharmacyName = valueOf("pendingRegistrationPharmacyName").trim();
    const pharmacyCode = valueOf("pendingRegistrationPharmacyCode").trim();
    const applicantName = valueOf("pendingRegistrationApplicantName").trim();
    if(!pharmacyName || pharmacyCode.length < 3){
        setAuthMessage("Enter pharmacy name and a pharmacy code of at least 3 characters.","error");
        return;
    }
    localStorage.setItem(AUTH_PENDING_REGISTRATION_KEY,JSON.stringify({pharmacyName,pharmacyCode,applicantName}));
    setAuthBusy(true,"Submitting pharmacy request...");
    try{
        await submitPendingRegistration();
        await loadMyRegistrationStatus();
        renderAuthState();
        setAuthMessage("Registration submitted. Waiting for System Owner approval.","success");
    }
    catch(error){ setAuthMessage(error.message || "Unable to submit registration.","error"); }
    finally{ setAuthBusy(false); }
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
    const token = normalizeInviteToken(valueOf("inviteSignupToken"));
    if(!email || password.length < 6 || !token){
        setAuthMessage("Enter your invited email, a password of at least 6 characters, and the invitation code.", "error");
        return;
    }
    localStorage.setItem(AUTH_PENDING_INVITE_KEY, token);
    setAuthBusy(true, "Creating invited account...");
    try{
        const result = await authRequest("/auth/v1/signup", {
            method:"POST",
            body:JSON.stringify({
                email,
                password,
                data:{display_name:name || email.split("@")[0]}
            })
        });
        if(result && result.access_token){
            persistAuthSession(result);
            await redeemPendingInvite();
            await loadMyAppContext();
            renderAuthState();
            if(hasApplicationAccess()){ unlockApplicationAfterAuth(); }
        }
        else{
            setAuthMessage("Account created. Confirm the email if requested, then sign in. Your invitation code is saved on this device.", "success");
            showAuthPanel("login");
            setInputValue("authEmail",email);
        }
    }
    catch(error){ setAuthMessage(error.message || "Unable to create account.","error"); }
    finally{ setAuthBusy(false); }
}

async function signUpInitialOwner(){
    if(AuthState.busy){ return; }
    await loadPublicSetupStatus().catch(()=>{});
    if(AuthState.ownerExists){
        setAuthMessage("The system owner is already configured. Use an invitation to activate a new account.","error");
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
            setAuthMessage("System Owner and pharmacy created successfully.","success");
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
                    "This email already has an authentication account. System Owner setup is NOT complete yet. Sign in with that account (or reset its password) to finish the saved setup.",
                    "error"
                );
            }
            else{
                setAuthMessage(
                    "Authentication account created. System Owner setup is NOT complete yet. Confirm the email if requested, then sign in with the same password to finish the saved pharmacy setup.",
                    "success"
                );
            }
        }
    }
    catch(error){ setAuthMessage(error.message || "Owner setup failed.","error"); }
    finally{ setAuthBusy(false); }
}

async function refreshAuthToken(){
    if(!AuthState.session || !AuthState.session.refresh_token){ return false; }
    try{
        const session = await authRequest("/auth/v1/token?grant_type=refresh_token",{
            method:"POST",
            body:JSON.stringify({refresh_token:AuthState.session.refresh_token})
        });
        persistAuthSession(session);
        return true;
    }
    catch(_){
        persistAuthSession(null);
        AuthState.context = null;
    AuthState.registration = null;
        lockApplicationForAuth();
        renderAuthState();
        return false;
    }
}

async function loadMyAppContext(){
    if(!getSupabaseAccessToken()){
        AuthState.context = null;
        AuthState.contextLoading = false;
        return null;
    }

    AuthState.contextLoading = true;
    try{
        const rows = await authRpc("get_my_app_context",{});
        const row = Array.isArray(rows) ? rows[0] : rows;
        AuthState.context = row || null;
        if(typeof AppState !== "undefined"){
            AppState.account = normalizeAccountContext(row);
        }
        return row;
    }
    catch(error){
        if(/jwt|token|expired/i.test(error.message || "")){
            const refreshed = await refreshAuthToken();
            if(refreshed){ return loadMyAppContext(); }
        }
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
    return !!(AuthState.context && AuthState.context.pharmacy_id);
}

async function finishPendingAccessIfPossible(){
    if(!getSupabaseAccessToken()){ return; }
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
        throw new Error("System Owner setup was not completed by the database. No success state was saved.");
    }

    await loadPublicSetupStatus();
    if(!AuthState.ownerExists){
        throw new Error("System Owner verification failed. Please retry before continuing.");
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
    clearRecoveryArtifacts();
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
    AuthState.context = null;
    AuthState.registration = null;
    if(typeof AppState !== "undefined" && typeof createEmptyAccountContext === "function"){
        AppState.account = createEmptyAccountContext();
    }
    lockApplicationForAuth();
    renderAuthState();
}

async function resumeAuthenticatedApp(){
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


async function loadOwnerRegistrationRequests(showMessage=false){
    if(!isSystemOwner()){ return []; }
    try{
        const rows = await authRpc("owner_list_pharmacy_registrations",{p_status:null});
        AuthState.ownerRegistrations = Array.isArray(rows) ? rows : [];
        renderOwnerRegistrationRequests();
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
    const rows = AuthState.ownerRegistrations || [];
    if(!rows.length){
        box.innerHTML = '<div class="registrationEmpty">No pharmacy registration requests yet.</div>';
        return;
    }
    box.innerHTML = rows.map(r=>{
        const pending = r.request_status === "pending";
        return `<article class="registrationRequestCard">
            <div class="registrationRequestTop">
                <div><strong>${escapeAuthHtml(r.pharmacy_name || "Pharmacy")}</strong><span>${escapeAuthHtml(r.pharmacy_code || "-")}</span></div>
                <span class="registrationStatus ${escapeAuthHtml(r.request_status || "")}">${escapeAuthHtml((r.request_status || "").toUpperCase())}</span>
            </div>
            <div class="registrationMeta">
                <span>${escapeAuthHtml(r.applicant_name || "Applicant")}</span>
                <span>${escapeAuthHtml(r.applicant_email || "")}</span>
                <span>${escapeAuthHtml(formatAuthDate(r.submitted_at))}</span>
            </div>
            ${pending ? `<div class="registrationActions">
                <button type="button" class="secondaryButton" data-reg-action="reject" data-reg-id="${escapeAuthHtml(r.request_id)}">Reject</button>
                <button type="button" class="primaryButton" data-reg-action="approve" data-reg-id="${escapeAuthHtml(r.request_id)}">Approve Pharmacy</button>
            </div>` : ''}
        </article>`;
    }).join("");
    box.querySelectorAll("[data-reg-action]").forEach(btn=>{
        btn.addEventListener("click",()=>reviewRegistration(btn.dataset.regId,btn.dataset.regAction));
    });
}

async function reviewRegistration(requestId,decision){
    if(!isSystemOwner() || !requestId){ return; }
    const approve = decision === "approve";
    const promptText = approve
        ? "Approve this pharmacy and create its ADMIN workspace?"
        : "Reject this pharmacy registration request?";
    if(!window.confirm(promptText)){ return; }
    setAuthBusy(true);
    try{
        await authRpc("owner_review_pharmacy_registration",{
            p_request_id:requestId,
            p_decision:decision,
            p_note:null
        });
        await loadOwnerRegistrationRequests(false);
        setSettingsAccessMessage(approve ? "Pharmacy approved successfully." : "Registration rejected.","success");
    }
    catch(error){ setSettingsAccessMessage(error.message || "Unable to review registration.","error"); }
    finally{ setAuthBusy(false); }
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
    if(AuthState.recoveryActive || window.__MEDRYVO_RECOVERY_ACTIVE){
        lockApplicationForAuth(true);
        showAuthPanel("recovery",{history:"replace"});
        return;
    }
    const overlay = document.getElementById("authGate");
    const accessPanel = document.getElementById("authAccessPanel");
    const formsPanel = document.getElementById("authFormsPanel");
    const account = AuthState.context;

    // Authenticated session exists, but pharmacy/role context is still loading.
    // Keep the current auth gate state unchanged rather than showing
    // "Complete access" prematurely.
    if(AuthState.session && AuthState.contextLoading){
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
    setText("settingsPharmacyName",account && account.pharmacy_name || "-");
    setText("settingsPharmacyCode",account && account.pharmacy_code || "-");
    setText("settingsSignedInUser",account && account.email || "-");
    setText("settingsUserRole",roleText || "-");

    const ownerCard = document.getElementById("ownerManagementCard");
    if(ownerCard){ ownerCard.hidden = !isSystemOwner(); }
    if(isSystemOwner()){ loadOwnerRegistrationRequests(false).catch(()=>{}); }
    const memberCard = document.getElementById("memberInviteCard");
    if(memberCard){ memberCard.hidden = !isPharmacyAdmin(); }
    const roleSelect = document.getElementById("memberInviteRole");
    if(roleSelect){
        const adminOption = roleSelect.querySelector('option[value="admin"]');
        if(adminOption){ adminOption.hidden = !isSystemOwner(); }
        if(!isSystemOwner()){ roleSelect.value = "staff"; }
    }

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
        setText("pendingRegistrationNote",r.review_note || (r.request_status === "pending" ? "Waiting for System Owner approval." : ""));
    }
}

function showAuthPanel(mode, options = {}){
    if(mode === "recovery" && (!AuthState.recoveryActive || !document.body.classList.contains("medryvoRecoveryMode"))){
        mode = "login";
    }

    const validMode = ["login","invite","owner","public","recovery"].includes(mode) ? mode : "login";

    const login = document.getElementById("authLoginForm");
    const invite = document.getElementById("authInviteSignupForm");
    const owner = document.getElementById("authOwnerSignupForm");
    const publicSignup = document.getElementById("authPublicSignupForm");
    const recovery = validMode === "recovery" && AuthState.recoveryActive
        ? mountRecoveryForm()
        : document.getElementById("authRecoveryForm");

    if(login){ login.hidden = validMode !== "login"; }
    if(invite){ invite.hidden = validMode !== "invite"; }
    if(owner){ owner.hidden = validMode !== "owner"; }
    if(publicSignup){ publicSignup.hidden = validMode !== "public"; }
    if(recovery){ recovery.hidden = validMode !== "recovery"; }

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

function lockApplicationForAuth(showLogin = true){
    document.body.classList.add("authLocked");
    if(showLogin){
        const overlay = document.getElementById("authGate");
        if(overlay){ overlay.classList.add("visible"); }
    }
}

function unlockApplicationAfterAuth(){
    if(AuthState.recoveryActive || window.__MEDRYVO_RECOVERY_ACTIVE){
        lockApplicationForAuth(true);
        showAuthPanel("recovery",{history:"replace"});
        return;
    }
    document.body.classList.remove("authLocked");
    const overlay = document.getElementById("authGate");
    if(overlay){ overlay.classList.remove("visible"); }
    if(typeof window.bootProtectedApplication === "function"){
        window.bootProtectedApplication();
    }
    else if(typeof refreshEntireUI === "function"){
        refreshEntireUI();
    }
}
