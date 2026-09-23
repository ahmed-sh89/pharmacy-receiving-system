"use strict";

/* The sole browser boundary for Global Identifier V2. It deliberately does
   not read or write legacy master or pharmacy-learned mapping stores. */
const IdentifierService={
    async resolve(identifierDisplay){
        const display=toSafeString(identifierDisplay);
        const pharmacyId=(typeof getCurrentPharmacyId==="function"&&getCurrentPharmacyId())||AuthState?.context?.pharmacy_id||null;
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
    async listItemIdentifiers(itemCode){
        const rows=await authRpc("list_pharmflow_global_item_identifiers_v2",{p_item_code:toSafeString(itemCode)});
        return Array.isArray(rows)?rows:[];
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
    }
};
window.IdentifierService=IdentifierService;
