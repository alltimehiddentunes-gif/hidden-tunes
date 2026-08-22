import{createHash}from"node:crypto";import type{OwnerAlertInput}from"./types";
export function ownerAlertFingerprint(i:OwnerAlertInput){return createHash("sha256").update([i.eventType,i.source,i.platform??"",i.environment??"production",i.entityType??"",i.entityId??""].join("|").toLowerCase()).digest("hex");}
