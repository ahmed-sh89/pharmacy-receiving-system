"use strict";

/* =====================================================
   PHARMACY RECEIVING SYSTEM V3
   APPLICATION CONFIGURATION
===================================================== */

const APP_CONFIG = Object.freeze({

    /* =================================================
       APPLICATION
    ================================================= */

    appName:
        "Medryvo",

    shortName:
        "MDV",

    version:
        "3.1.0",

    edition:
        "Enterprise",

    environment:
        "production",


    /* =================================================
       DATABASE
    ================================================= */

    database:{

        name:
            "PharmacyReceivingSystemV3",

        version:
            1,

        stores:{

            orders:
                "orders",

            transactions:
                "receivingTransactions",

            sessions:
                "sessions",

            archive:
                "archive",

            metadata:
                "metadata"

        }

    },


    /* =================================================
       LOCAL STORAGE
    ================================================= */

    storageKeys:{

        deviceId:
            "PRS_V3_DEVICE_ID",

        currentWorkspace:
            "PRS_V3_CURRENT_WORKSPACE",

        currentSession:
            "PRS_V3_CURRENT_SESSION",

        settings:
            "PRS_V3_SETTINGS",

        lastPage:
            "PRS_V3_LAST_PAGE"

    },


    /* =================================================
       RECEIVING
    ================================================= */

    receiving:{

        allowOverReceiving:
            true,

        defaultQuantity:
            1,

        autofocusScanner:
            true,

        duplicateScanProtection:
            true,

        duplicateScanWindowMs:
            500,

        scannerFocusDelayMs:
            120,

        historyDisplayLimit:
            250,

        searchResultLimit:
            40

    },


    /* =================================================
       AUTO SAVE
    ================================================= */

    autosave:{

        enabled:
            true,

        intervalMs:
            5000,

        saveAfterEveryTransaction:
            true

    },


    /* =================================================
       FILE IMPORT
    ================================================= */

    import:{

        orderExtensions:[
            ".xlsx",
            ".xls"
        ],

        mappingExtensions:[
            ".xlsx",
            ".xls"
        ],

        zebraExtensions:[
            ".prs",
            ".json"
        ],

        maxFilesPerImport:
            50

    },


    /* =================================================
       ORDER COLUMN MATCHING
    ================================================= */

    orderColumns:{

        itemCode:[

            "item code",
            "itemcode",
            "item number",
            "itemnumber",
            "item no",
            "itemno",
            "code",
            "sku"

        ],

        itemName:[

            "item name",
            "itemname",
            "description",
            "product name",
            "productname",
            "name"

        ],

        orderedQty:[

            "ordered qty",
            "ordered quantity",
            "order qty",
            "order quantity",
            "qty",
            "quantity"

        ]

    },


    /* =================================================
       MAPPING COLUMN MATCHING
    ================================================= */

    mappingColumns:{

        itemCode:[

            "item code",
            "itemcode",
            "item number",
            "itemnumber",
            "item no",
            "itemno",
            "code",
            "sku"

        ],

        gtin:[

            "gtin",
            "barcode",
            "bar code",
            "ean",
            "ean13",
            "ean14",
            "data matrix",
            "datamatrix"

        ]

    },


    /* =================================================
       STATUS VALUES
    ================================================= */

    statuses:{

        pending:
            "Pending",

        receiving:
            "Receiving",

        completed:
            "Completed",

        over:
            "Over",

        manual:
            "Manual",

        notFound:
            "Not Found"

    },


    /* =================================================
       TRANSACTION SOURCES
    ================================================= */

    transactionSources:{

        scanner:
            "SCAN",

        search:
            "SEARCH",

        manual:
            "MANUAL",

        zebraMerge:
            "ZEBRA_MERGE"

    },


    /* =================================================
       ROUTES
    ================================================= */

    routes:{

        dashboard:{

            id:
                "dashboard",

            elementId:
                "page-dashboard",

            title:
                "Dashboard",

            subtitle:
                "Receiving overview"

        },

        receiving:{

            id:
                "receiving",

            elementId:
                "page-receiving",

            title:
                "Receiving",

            subtitle:
                "Current order items"

        },

        files:{

            id:
                "files",

            elementId:
                "page-files",

            title:
                "Orders & Mappings",

            subtitle:
                "Import receiving data"

        },

        reports:{

            id:
                "reports",

            elementId:
                "page-reports",

            title:
                "Reports",

            subtitle:
                "Historical receiving reports"

        },

        sessions:{

            id:
                "sessions",

            elementId:
                "page-sessions",

            title:
                "Zebra & Sessions",

            subtitle:
                "Device session management"

        },

        archive:{

            id:
                "archive",

            elementId:
                "page-archive",

            title:
                "Archive",

            subtitle:
                "Historical completed orders"

        },

        settings:{

            id:
                "settings",

            elementId:
                "page-settings",

            title:
                "Settings",

            subtitle:
                "Workspace and data management"

        }

    },


    /* =================================================
       REPORTS
    ================================================= */

    reports:{

        defaultFilePrefix:
            "Medryvo_Receiving_Report",

        itemReportFilePrefix:
            "Medryvo_Item_Receiving_Report",

        archiveFilePrefix:
            "Medryvo_Receiving_Archive",

        dateFormat:
            "yyyy-mm-dd",

        includeDevice:
            true,

        includeSource:
            true

    },


    /* =================================================
       SESSION FILES
    ================================================= */

    session:{

        fileExtension:
            ".prs",

        fileVersion:
            "3.1",

        exportPrefix:
            "Zebra_Receiving_Session",

        workFilePrefix:
            "Zebra_Work_Order",

        workFileType:
            "PHARMACY_RECEIVING_ZEBRA_WORK",

        sessionFileType:
            "PHARMACY_RECEIVING_ZEBRA_SESSION"

    },


    /* =================================================
       ARCHIVE
    ================================================= */

    archive:{

        preserveTransactions:
            true,

        preserveOrders:
            true,

        preserveFileMetadata:
            true,

        deleteHistoryRequiresConfirmation:
            true

    },


    /* =================================================
       UI
    ================================================= */

    ui:{

        sidebarDesktopWidth:
            260,

        sidebarCollapsedWidth:
            82,

        toastDurationMs:
            2600,

        loadingDelayMs:
            120,

        mobileBreakpoint:
            1024

    }

});


/* =====================================================
   FREEZE NESTED CONFIG OBJECTS
===================================================== */

function deepFreezeConfig(object){

    Object.getOwnPropertyNames(
        object
    ).forEach(name=>{

        const value =
            object[name];

        if(
            value &&
            typeof value === "object" &&
            !Object.isFrozen(value)
        ){

            deepFreezeConfig(value);

        }

    });

    return Object.freeze(object);

}


deepFreezeConfig(
    APP_CONFIG
);


/* =====================================================
   END CONFIG
===================================================== */