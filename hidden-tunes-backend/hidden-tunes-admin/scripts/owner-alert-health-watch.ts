import{normalizePm2Snapshot,type Pm2Snapshot}from"../lib/ownerAlerts/watchdog";import{recordOwnerAlert}from"../lib/ownerAlerts/service";
export async function observePm2Snapshot(snapshot:Pm2Snapshot){const event=normalizePm2Snapshot(snapshot);return event?recordOwnerAlert(event):{ok:true as const,skipped:true as const};}
if(process.argv.includes("--run")){console.error("Watchdog startup is disabled in Phase 1. Import observePm2Snapshot from an authorized supervisor.");process.exitCode=2;}
