"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   ROUTER
===================================================== */


/* =====================================================
   ROUTER STATE
===================================================== */

const AppRouter = {

    initialized:false,

    currentRoute:"dashboard",

    routes:
        APP_CONFIG.routes

};


/* =====================================================
   INITIALIZE ROUTER
===================================================== */

function initializeRouter(){

    if(AppRouter.initialized){
        return;
    }


    bindRouterNavigation();


    const savedPage =
        storageGet(
            APP_CONFIG
                .storageKeys
                .lastPage,
            "dashboard"
        );


    const initialPage =
        routeExists(savedPage)
        ?
        savedPage
        :
        "dashboard";


    navigateTo(
        initialPage,
        {
            save:false
        }
    );


    AppRouter.initialized = true;


    Logger.info(
        "Router initialized"
    );

}


/* =====================================================
   CHECK ROUTE
===================================================== */

function routeExists(routeName){

    return Boolean(
        AppRouter.routes[
            routeName
        ]
    );

}


/* =====================================================
   NAVIGATE
===================================================== */

function navigateTo(
    routeName,
    options = {}
){

    const config = {

        save:true,

        closeSidebar:true,

        focusScanner:true,

        ...options

    };


    if(
        !routeExists(
            routeName
        )
    ){

        Logger.warn(
            "Unknown route:",
            routeName
        );

        routeName =
            "dashboard";

    }


    const route =
        AppRouter.routes[
            routeName
        ];


    hideAllPages();


    const page =
        document.getElementById(
            route.elementId
        );


    if(!page){

        Logger.error(
            "Page element not found:",
            route.elementId
        );

        return false;

    }


    page.classList.add(
        "active"
    );


    AppRouter.currentRoute =
        routeName;


    AppState.ui.currentPage =
        routeName;


    updateActiveNavigation(
        routeName
    );


    updatePageHeading(
        route
    );


    if(config.save){

        storageSet(
            APP_CONFIG
                .storageKeys
                .lastPage,
            routeName
        );

    }


    if(config.closeSidebar){

        closeMobileSidebar();

    }


    AppEvents.emit(
        "route:changed",
        {
            routeName,
            route
        }
    );


    /*
       Return focus to scanner only
       on receiving-related pages.
    */

    if(
        config.focusScanner &&
        (
            routeName === "dashboard" ||
            routeName === "receiving"
        )
    ){

        setTimeout(()=>{

            if(
                typeof focusScannerInput ===
                "function"
            ){

                focusScannerInput();

            }

        },
        APP_CONFIG
            .receiving
            .scannerFocusDelayMs);

    }


    return true;

}


/* =====================================================
   HIDE ALL PAGES
===================================================== */

function hideAllPages(){

    document
        .querySelectorAll(
            ".appPage"
        )
        .forEach(page=>{

            page.classList.remove(
                "active"
            );

        });

}


/* =====================================================
   UPDATE ACTIVE SIDEBAR ITEM
===================================================== */

function updateActiveNavigation(
    routeName
){

    document
        .querySelectorAll(
            ".sidebarItem"
        )
        .forEach(button=>{

            button.classList
                .remove(
                    "active"
                );


            if(
                button.dataset.page ===
                routeName
            ){

                button.classList
                    .add(
                        "active"
                    );

            }

        });

}


/* =====================================================
   UPDATE PAGE HEADER
===================================================== */

function updatePageHeading(route){

    const title =
        document.getElementById(
            "pageTitle"
        );


    const subtitle =
        document.getElementById(
            "pageSubtitle"
        );


    if(title){

        title.textContent =
            route.title;

    }


    if(subtitle){

        subtitle.textContent =
            route.subtitle;

    }

}


/* =====================================================
   BIND SIDEBAR NAVIGATION
===================================================== */

function bindRouterNavigation(){

    document
        .querySelectorAll(
            ".sidebarItem"
        )
        .forEach(button=>{

            button.addEventListener(
                "click",
                function(){

                    const pageName =
                        this.dataset.page;


                    if(!pageName){
                        return;
                    }


                    navigateTo(
                        pageName
                    );

                }
            );

        });

}


/* =====================================================
   SIDEBAR MOBILE CLOSE
===================================================== */

function closeMobileSidebar(){

    if(
        window.innerWidth >
        APP_CONFIG
            .ui
            .mobileBreakpoint
    ){

        return;

    }


    const sidebar =
        document.getElementById(
            "sidebar"
        );


    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );


    if(sidebar){

        sidebar.classList.remove(
            "show"
        );

    }


    if(overlay){

        overlay.classList.remove(
            "show"
        );

    }


    AppState.ui.sidebarOpen =
        false;

}


/* =====================================================
   SIDEBAR OPEN
===================================================== */

function openMobileSidebar(){

    const sidebar =
        document.getElementById(
            "sidebar"
        );


    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );


    if(sidebar){

        sidebar.classList.add(
            "show"
        );

    }


    if(overlay){

        overlay.classList.add(
            "show"
        );

    }


    AppState.ui.sidebarOpen =
        true;

}


/* =====================================================
   DESKTOP SIDEBAR TOGGLE
===================================================== */

function toggleDesktopSidebar(){

    const isMobile =
        window.innerWidth <=
        APP_CONFIG
            .ui
            .mobileBreakpoint;


    if(isMobile){

        if(
            AppState.ui.sidebarOpen
        ){

            closeMobileSidebar();

        }
        else{

            openMobileSidebar();

        }


        return;

    }


    document.body
        .classList
        .toggle(
            "sidebarCollapsed"
        );


    AppState.ui
        .sidebarCollapsed =
        document.body
            .classList
            .contains(
                "sidebarCollapsed"
            );

}


/* =====================================================
   MENU BUTTON
===================================================== */

function handleMainMenuButton(){

    toggleDesktopSidebar();

}


/* =====================================================
   CLOSE SIDEBAR BUTTON
===================================================== */

function handleSidebarCloseButton(){

    closeMobileSidebar();

}


/* =====================================================
   OVERLAY CLICK
===================================================== */

function handleSidebarOverlayClick(){

    closeMobileSidebar();

}


/* =====================================================
   WINDOW RESIZE
===================================================== */

function handleRouterResize(){

    if(
        window.innerWidth >
        APP_CONFIG
            .ui
            .mobileBreakpoint
    ){

        closeMobileSidebar();

    }

}


/* =====================================================
   GET CURRENT ROUTE
===================================================== */

function getCurrentRoute(){

    return (
        AppRouter.routes[
            AppRouter.currentRoute
        ]
        ||
        null
    );

}


/* =====================================================
   GET CURRENT PAGE NAME
===================================================== */

function getCurrentPageName(){

    return (
        AppRouter.currentRoute
        ||
        "dashboard"
    );

}


/* =====================================================
   GO TO DASHBOARD
===================================================== */

function goToDashboard(){

    return navigateTo(
        "dashboard"
    );

}


/* =====================================================
   GO TO RECEIVING
===================================================== */

function goToReceiving(){

    return navigateTo(
        "receiving"
    );

}


/* =====================================================
   GO TO FILE IMPORT
===================================================== */

function goToFiles(){

    return navigateTo(
        "files",
        {
            focusScanner:false
        }
    );

}


/* =====================================================
   GO TO REPORTS
===================================================== */

function goToReports(){

    return navigateTo(
        "reports",
        {
            focusScanner:false
        }
    );

}


/* =====================================================
   GO TO SESSIONS
===================================================== */

function goToSessions(){

    return navigateTo(
        "sessions",
        {
            focusScanner:false
        }
    );

}


/* =====================================================
   GO TO ARCHIVE
===================================================== */

function goToArchive(){

    return navigateTo(
        "archive",
        {
            focusScanner:false
        }
    );

}


/* =====================================================
   GO TO SETTINGS
===================================================== */

function goToSettings(){

    return navigateTo(
        "settings",
        {
            focusScanner:false
        }
    );

}


/* =====================================================
   ROUTER KEYBOARD SHORTCUTS
===================================================== */

function handleRouterKeyboardShortcut(
    event
){

    /*
       Ignore keyboard shortcuts while
       typing inside form controls.
    */

    const target =
        event.target;


    const tagName =
        target &&
        target.tagName
        ?
        target.tagName.toLowerCase()
        :
        "";


    const isTyping =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select";


    if(isTyping){
        return;
    }


    /*
       Alt + 1 = Dashboard
       Alt + 2 = Receiving
       Alt + 3 = Files
       Alt + 4 = Reports
    */

    if(!event.altKey){
        return;
    }


    switch(event.key){

        case "1":

            event.preventDefault();

            goToDashboard();

            break;


        case "2":

            event.preventDefault();

            goToReceiving();

            break;


        case "3":

            event.preventDefault();

            goToFiles();

            break;


        case "4":

            event.preventDefault();

            goToReports();

            break;

    }

}


/* =====================================================
   ROUTER EVENT BINDINGS
===================================================== */

function bindRouterGlobalEvents(){

    const menuButton =
        document.getElementById(
            "btnMenu"
        );


    const closeButton =
        document.getElementById(
            "btnCloseSidebar"
        );


    const overlay =
        document.getElementById(
            "sidebarOverlay"
        );


    if(menuButton){

        menuButton.addEventListener(
            "click",
            handleMainMenuButton
        );

    }


    if(closeButton){

        closeButton.addEventListener(
            "click",
            handleSidebarCloseButton
        );

    }


    if(overlay){

        overlay.addEventListener(
            "click",
            handleSidebarOverlayClick
        );

    }


    window.addEventListener(
        "resize",
        debounce(
            handleRouterResize,
            100
        )
    );


    document.addEventListener(
        "keydown",
        handleRouterKeyboardShortcut
    );

}


/* =====================================================
   START ROUTER
===================================================== */

function startRouter(){

    bindRouterGlobalEvents();

    initializeRouter();

}


/* =====================================================
   END ROUTER
===================================================== */