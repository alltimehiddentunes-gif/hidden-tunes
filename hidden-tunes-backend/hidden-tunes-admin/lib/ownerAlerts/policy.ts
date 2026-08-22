import type{AlertSeverity,AlertStatus,DeliveryState}from"./types";
export const MAX_DELIVERY_ATTEMPTS=3; export const ALERT_COOLDOWN_MS:Record<AlertSeverity,number>={critical:300000,high:900000,normal:86400000,info:86400000};
export const initialDeliveryState=(s:AlertSeverity):DeliveryState=>s==="critical"||s==="high"?"pending":"digest_pending";
export const isImmediate=(s:AlertSeverity)=>s==="critical"||s==="high";
export const shouldEscalate=(n:number)=>[5,25,100].includes(n);
export function shouldDeliver(s:AlertSeverity,n:number,last:string|null,now:Date){return isImmediate(s)&&(!last||(shouldEscalate(n)&&now.getTime()-new Date(last).getTime()>=ALERT_COOLDOWN_MS[s]));}
export function reopenedStatus(s:AlertStatus,resolved:string|null,at:Date):AlertStatus{return s==="resolved"&&resolved&&at>new Date(resolved)?"open":s;}
