"use strict";

/* The sole browser boundary for identifier resolution and administration.
   The server resolves the current pharmacy first, then Global V2. Browser
   code never writes the legacy mapping contracts directly. */
const IdentifierService={
    pharmacyId(){
        return (typeof getCurrentPharmacyId==="function"&&getCurrentPharmacyId())||AuthState?.context?.pharmacy_id||null;
    },
    async resolve(identifierDisplay){
        const display=toSafeString(identifierDisplay);
        const pharmacyId=this.pharmacyId();
        if(!display) throw new Error("Identifier is required");
        if(!pharmacyId||typeof authRpc!=="function") throw new Error("Authoritative identifier service is unavailable");
        const result=await authRpc("resolve_pharmflow_identifier_v2",{p_pharmacy_id:pharmacyId,p_identifier_display:display});
        return Array.isArray(result)?(result[0]||{found:false}):(result||{found:false});
    },
    async searchItems(query,limit=50){
        if(typeof authRpc!=="function") throw new Error("Authoritative identifier service is unavailable");
        const rows=await authRpc("search_pharmflow_global_items_v2",{p_query:toSafeString(query),p_limit:limit});
        return Array.isArray(rows)?rows:[];
    },
    async adminScope(){
        const pharmacyId=this.pharmacyId();
        if(!pharmacyId) throw new Error("Current pharmacy is unavailable");
        return authRpc("get_pharmflow_identifier_admin_scope_v1",{p_pharmacy_id:pharmacyId});
    },
    async listItemIdentifiers(itemCode){
        const pharmacyId=this.pharmacyId();
        if(!pharmacyId) throw new Error("Current pharmacy is unavailable");
        const rows=await authRpc("list_pharmflow_item_identifiers_for_pharmacy_v1",{p_pharmacy_id:pharmacyId,p_item_code:toSafeString(itemCode)});
        return Array.isArray(rows)?rows:[];
    },
    async addForCurrentPharmacy(operationId,identifierDisplay,item,reason){
        const pharmacyId=this.pharmacyId();
        if(!pharmacyId) throw new Error("Current pharmacy is unavailable");
        return authRpc("route_pharmflow_identifier_add_v1",{
            p_operation_id:operationId,p_pharmacy_id:pharmacyId,
            p_identifier_display:toSafeString(identifierDisplay),
            p_item_code:toSafeString(item?.itemCode||item?.item_code),
            p_item_name:toSafeString(item?.itemName||item?.item_name),
            p_reason:toSafeString(reason)
        });
    },
    async addIdentifier(operationId,identifierDisplay,itemCode,reason){
        return authRpc("add_pharmflow_global_identifier_v2",{p_operation_id:operationId,p_identifier_display:toSafeString(identifierDisplay),p_item_code:toSafeString(itemCode),p_reason:toSafeString(reason)});
    },
    async correctIdentifier(operationId,identifierId,revision,itemCode,reason){
        return authRpc("correct_pharmflow_global_identifier_v2",{p_operation_id:operationId,p_identifier_id:identifierId,p_expected_mapping_revision:revision,p_new_item_code:toSafeString(itemCode),p_reason:toSafeString(reason)});
    },
    async removeIdentifier(operationId,identifierId,revision,reason){
        return authRpc("remove_pharmflow_global_identifier_v2",{p_operation_id:operationId,p_identifier_id:identifierId,p_expected_mapping_revision:revision,p_reason:toSafeString(reason)});
    },
    async createItem(operationId,item){
        return authRpc("create_pharmflow_global_item_v2",{p_operation_id:operationId,p_item_code:toSafeString(item.itemCode),p_item_name:toSafeString(item.itemName),p_group_name:toSafeString(item.groupName)||null,p_category:toSafeString(item.category)||null,p_sub_category:toSafeString(item.subCategory)||null,p_identifier_display:toSafeString(item.identifierDisplay),p_reason:toSafeString(item.reason)});
    },
    async addPharmacyIdentifier(operationId,identifierDisplay,item,reason){
        const pharmacyId=this.pharmacyId();
        if(!pharmacyId) throw new Error("Current pharmacy is unavailable");
        return authRpc("add_pharmflow_pharmacy_identifier_v2",{p_operation_id:operationId,p_pharmacy_id:pharmacyId,p_identifier_display:toSafeString(identifierDisplay),p_item_code:toSafeString(item?.itemCode||item?.item_code),p_item_name:toSafeString(item?.itemName||item?.item_name),p_reason:toSafeString(reason)});
    },
    async correctPharmacyIdentifier(operationId,identifierId,revision,item,reason){
        const pharmacyId=this.pharmacyId();
        if(!pharmacyId) throw new Error("Current pharmacy is unavailable");
        return authRpc("correct_pharmflow_pharmacy_identifier_v2",{p_operation_id:operationId,p_pharmacy_id:pharmacyId,p_identifier_id:identifierId,p_expected_mapping_revision:revision,p_new_item_code:toSafeString(item?.itemCode||item?.item_code),p_new_item_name:toSafeString(item?.itemName||item?.item_name),p_reason:toSafeString(reason)});
    },
    async removePharmacyIdentifier(operationId,identifierId,revision,reason){
        const pharmacyId=this.pharmacyId();
        if(!pharmacyId) throw new Error("Current pharmacy is unavailable");
        return authRpc("remove_pharmflow_pharmacy_identifier_v2",{p_operation_id:operationId,p_pharmacy_id:pharmacyId,p_identifier_id:identifierId,p_expected_mapping_revision:revision,p_reason:toSafeString(reason)});
    }
};
window.IdentifierService=IdentifierService;
