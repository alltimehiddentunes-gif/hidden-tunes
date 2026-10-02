const WINDOW_MS = 60_000;
let windowStart=0;
let total=0;
let buckets=new Map<string,number>();
/** Includes malformed requests; keys are ephemeral HMACs, never raw addresses. */
export function allowIntake(rateKey:string,now=Date.now()):boolean {
 const start=Math.floor(now/WINDOW_MS)*WINDOW_MS;
 if(start!==windowStart){windowStart=start;total=0;buckets=new Map();}
 total++;
 const count=(buckets.get(rateKey)||0)+1;
 if(buckets.size<4096||buckets.has(rateKey)) buckets.set(rateKey,count);
 else return false;
 return total<=1200&&count<=120;
}
