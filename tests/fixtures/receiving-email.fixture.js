function buildReceivingEmailAcceptanceReport(scenario="realistic"){
 const row=(code,name,ordered,received,status)=>({"Item Number":code,"Item Name":name,"Ordered Qty":ordered,"Received Qty":received,"Difference":received-ordered,"Issue Type":status});
 const groups=[
  {orderNumber:"TO-000532501",orderDate:"2026-10-29",rows:[row("1010120","Johnson Anti Bacterial B.Wash Sea Salt 250 Ml 31233-5876",3,4,"Over Received")]},
  {orderNumber:"TO-000532448",orderDate:"2026-10-30",rows:[row("1014553","Zimax 250 MG 6 Cap",30,29,"Partial Shortage"),row("1013953","Reparil 40 Tab",40,39,"Partial Shortage"),row("1014085","Sartan 50 Mg 30 Tab",7,8,"Over Received")]}
 ];
 const extra=()=>row("1010300","La Roche Posay Anthelios SPF50+ Invisible Fluid 50 Ml",0,3,"Extra Item");
 if(scenario==="twoIndicators")groups[1].rows=[groups[1].rows[2]];
 if(scenario==="four")groups[1].rows.push(row("1010200","Panadol Advance 500 Mg 24 Tab",12,0,"Not Received"));
 if(scenario==="five"||scenario==="large")groups[1].rows.push(row("1010200","Panadol Advance 500 Mg 24 Tab",12,0,"Not Received"),extra());
 if(scenario==="large"){
  groups[0].rows[0]=row("1010120",groups[0].rows[0]["Item Name"],3,1253,"Over Received");
  groups[1].rows[0]=row("1014553","Zimax 250 MG 6 Cap",300,60,"Partial Shortage");
  groups[1].rows[1]=row("1013953","Reparil 40 Tab",400,0,"Not Received");
  groups[1].rows[2]=row("1014085","Sartan 50 Mg 30 Tab",7,1257,"Over Received");
  groups[1].rows[4]["Received Qty"]=75;groups[1].rows[4]["Difference"]=75;
 }
 if(scenario==="long")groups[1].rows.push(row("1010300","La Roche Posay Anthelios UVMune 400 Invisible Fluid SPF50+ Fragrance Free 50 Ml",10,8,"Partial Shortage"));
 if(scenario==="singleKpi")return {orderGroups:[{orderNumber:"UNASSIGNED",orderDate:"2026-10-30",unassigned:true,rows:[extra()]}]};
 if(scenario==="zero")return {orderGroups:[{...groups[1],rows:groups[1].rows.slice(0,2)}]};
 return {orderGroups:scenario==="one"?groups.slice(0,1):groups};
}
