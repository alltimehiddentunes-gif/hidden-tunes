import type{OwnerAlertRecord}from"./types";
export const selectDigestAlerts=(a:OwnerAlertRecord[])=>a.filter(x=>(x.severity==="normal"||x.severity==="info")&&x.delivery_state==="digest_pending");
export function buildOwnerDigest(a:OwnerAlertRecord[]){const m=new Map<string,number>();for(const x of selectDigestAlerts(a))m.set(x.event_type,(m.get(x.event_type)??0)+x.occurrence_count);return`HiddenTunes Daily: ${[...m].map(([k,v])=>`${k}: ${v}`).join(" · ")||"No reportable activity."}`.slice(0,1200);}
