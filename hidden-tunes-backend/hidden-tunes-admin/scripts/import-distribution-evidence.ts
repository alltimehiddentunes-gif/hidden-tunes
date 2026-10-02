import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { importEvidence, validateEvidenceImport } from "../lib/distribution/store";
const args=process.argv.slice(2);
const path=args.find(a=>!a.startsWith("--"));
if(!path||args.filter(a=>!a.startsWith("--")).length!==1||args.some(a=>a.startsWith("--")&&a!=="--apply")) throw new Error("Usage: tsx scripts/import-distribution-evidence.ts evidence.json [--apply]. Defaults to validated dry run.");
if(statSync(path).size>8*1024*1024) throw new Error("Evidence file exceeds 8 MiB");
const bytes=readFileSync(path);
let document:unknown;
try { document=JSON.parse(bytes.toString("utf8")); } catch { throw new Error("Evidence is not valid JSON; input contents withheld"); }
const input=validateEvidenceImport(document);
if(!args.includes("--apply")) {
 console.log(JSON.stringify({mode:"DRY RUN — no persistence",sha256:createHash("sha256").update(bytes).digest("hex"),evidenceId:input.evidenceId,source:{id:input.source.id,label:input.source.label,freshness:input.source.freshness,note:input.source.note},coverage:input.coverage,metrics:input.metrics,rows:input.rows.length,note:"Schema validated. Review evidence provenance, exclusions, sampling, coverage and acquisition ambiguity before applying."},null,2));
} else {
 if(!process.env.ANALYTICS_DATA_DIR) throw new Error("Set an explicit ANALYTICS_DATA_DIR for evidence application");
 console.log(JSON.stringify(importEvidence(input),null,2));
}
