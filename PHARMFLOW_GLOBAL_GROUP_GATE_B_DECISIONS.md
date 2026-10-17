# Decision Register — Global Master Group Gate B

1. **Allowed Groups:** six controlled main Groups only: Beauty, FMCG, HomeHealth, Medicine, Mom & Baby, Supplement. No subordinate category is a Group.
2. **Creation rule:** require Group only when an operation creates a genuinely new Global Item. Existing Global item identifier linking remains Group-free. Pharmacy-scoped identifier mapping does not create a Global Item and retains its existing behavior.
3. **Canonical value:** retain `HomeHealth` in storage for backward compatibility; display `Home Health` in new UI, filters, and reports. Normalize either spelling to `HomeHealth` at the controlled boundary.
4. **Legacy fallback:** use `group_name` first. Use `category` only when its normalized value is exactly one of the six main Groups. Preserve all category fields.
5. **61 reviewed items:** classifications from the approved workbook are allowed in the prepared SQL only after exact item-code/name reconciliation. No classifications were applied.
6. **Legacy test items:** preserve `PFTEST002` and `PFTEST003` with blank Group. No blanket NOT NULL constraint.
7. **National Day Gift Card / `9999982`:** the Product Owner confirmed it was intentionally deleted through Settings. It is absent from Global Master and excluded from classification. Do not restore, reclassify, or investigate its deletion further unless a new material integrity issue is found.
8. **Security:** keep SECURITY DEFINER entry points authenticated and permission-checked. Enforce the Group rule in Global Item creation RPCs. Keep direct table access and pharmacy boundaries unchanged.
9. **Production gate:** Product Owner approval of 61 classifications and code implementation does not approve applying SQL or deploying. Both remain separate approval gates.
10. **Expiry:** no Expiry branch edits, merge, or deployment. Use the integration contract in the checkpoint after a separate approved synchronization task.
