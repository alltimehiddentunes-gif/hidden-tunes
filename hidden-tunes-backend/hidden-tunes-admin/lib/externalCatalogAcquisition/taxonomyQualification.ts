import { buildNormalizedGenrePayload, inferGenreSelectionFromLabel } from "../uploadGenreTaxonomy";
import type { TaxonomyConfidence, TaxonomyResult } from "./qualificationTypes";
function key(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
type Mapping={mainGenreId:string;subgenreId:string;confidence:number;reason:string};
const OVERRIDES:Record<string,Mapping>={
  ambient:{mainGenreId:"electronic",subgenreId:"electronic-core",confidence:.7,reason:"Ambient is conservatively grouped under the existing Electronic family."},
  "big beat":{mainGenreId:"electronic",subgenreId:"edm",confidence:.7,reason:"Big Beat is an electronic dance subgenre."},
  blues:{mainGenreId:"soul-blues",subgenreId:"blues",confidence:.95,reason:"Exact existing Blues taxonomy term."},
  celtique:{mainGenreId:"traditional-folk",subgenreId:"world",confidence:.8,reason:"Celtic is mapped to the existing World subgenre within Traditional/Folk."},
  "chanson francophone":{mainGenreId:"traditional-folk",subgenreId:"folk",confidence:.65,reason:"French chanson is a defensible folk/song mapping but remains medium confidence."},
  chill:{mainGenreId:"lo-fi",subgenreId:"chill-lofi",confidence:.65,reason:"Chill is treated as a lo-fi subgenre only at medium confidence."},
  "drum n bass":{mainGenreId:"electronic",subgenreId:"edm",confidence:.8,reason:"Drum and bass is mapped to the existing EDM electronic family."},
  experimental:{mainGenreId:"electronic",subgenreId:"electronic-core",confidence:.55,reason:"Experimental has no exact existing term and is only provisionally grouped."},
  indus:{mainGenreId:"electronic",subgenreId:"electronic-core",confidence:.7,reason:"Industrial is mapped to the existing Electronic family."},
  noise:{mainGenreId:"electronic",subgenreId:"electronic-core",confidence:.5,reason:"Noise is provisionally grouped under Electronic and requires review."},
  progressif:{mainGenreId:"rock",subgenreId:"rock-core",confidence:.75,reason:"Progressive is mapped to the existing Rock family."},
  "punk rock":{mainGenreId:"rock",subgenreId:"rock-core",confidence:.85,reason:"Punk Rock is mapped to the existing Rock family."},
  rock:{mainGenreId:"rock",subgenreId:"rock-core",confidence:.95,reason:"Exact existing Rock taxonomy term."},
  techno:{mainGenreId:"electronic",subgenreId:"electronic-core",confidence:.95,reason:"Techno is an existing Electronic-family term."},
  "videogame jeuxvideo":{mainGenreId:"electronic",subgenreId:"electronic-core",confidence:.45,reason:"Video-game tag has no exact taxonomy equivalent and remains review-required."},
  gospel:{mainGenreId:"gospel-worship",subgenreId:"gospel",confidence:.95,reason:"Exact existing Gospel taxonomy term."},
  christian:{mainGenreId:"gospel-worship",subgenreId:"gospel-worship-core",confidence:.9,reason:"Christian is mapped to the existing Gospel/Worship family."},
  religious:{mainGenreId:"gospel-worship",subgenreId:"gospel-worship-core",confidence:.7,reason:"Religious is mapped conservatively to Gospel/Worship at medium confidence."},
  sacred:{mainGenreId:"gospel-worship",subgenreId:"gospel-worship-core",confidence:.7,reason:"Sacred is mapped conservatively to Gospel/Worship at medium confidence."},
  worship:{mainGenreId:"gospel-worship",subgenreId:"worship",confidence:.95,reason:"Exact existing Worship taxonomy term."},
  choir:{mainGenreId:"gospel-worship",subgenreId:"gospel-worship-core",confidence:.55,reason:"Choir is a performance form, not a definitive genre; review required."},
  choral:{mainGenreId:"gospel-worship",subgenreId:"gospel-worship-core",confidence:.55,reason:"Choral is a performance form, not a definitive genre; review required."},
  hymn:{mainGenreId:"gospel-worship",subgenreId:"gospel-worship-core",confidence:.65,reason:"Hymn is mapped to Gospel/Worship only at medium confidence."},
  spiritual:{mainGenreId:"gospel-worship",subgenreId:"gospel-worship-core",confidence:.65,reason:"Spiritual is mapped to Gospel/Worship only at medium confidence."},
  instrumental:{mainGenreId:"instrumental",subgenreId:"instrumental-core",confidence:.95,reason:"Exact existing Instrumental taxonomy term."},
  acoustic:{mainGenreId:"traditional-folk",subgenreId:"folk",confidence:.55,reason:"Acoustic describes instrumentation rather than genre; review required."},
  folk:{mainGenreId:"traditional-folk",subgenreId:"folk",confidence:.95,reason:"Exact existing Folk taxonomy term."},
  pop:{mainGenreId:"pop",subgenreId:"pop-core",confidence:.95,reason:"Exact existing Pop taxonomy term."},
  electronic:{mainGenreId:"electronic",subgenreId:"electronic-core",confidence:.95,reason:"Exact existing Electronic taxonomy term."},
  world:{mainGenreId:"traditional-folk",subgenreId:"world",confidence:.95,reason:"Existing World taxonomy alias."},
  reggae:{mainGenreId:"reggae-dancehall",subgenreId:"reggae",confidence:.95,reason:"Exact existing Reggae taxonomy term."},
  "hip hop":{mainGenreId:"hip-hop-rap",subgenreId:"hip-hop",confidence:.95,reason:"Existing Hip-Hop taxonomy term."},
  jazz:{mainGenreId:"jazz",subgenreId:"jazz-core",confidence:.95,reason:"Exact existing Jazz taxonomy term."},
};
function mappingFor(source:string):Mapping|null { const normalized=key(source); if(OVERRIDES[normalized]) return OVERRIDES[normalized]; const selection=inferGenreSelectionFromLabel(source); if(!selection) return null; return { ...selection, confidence:.9, reason:"Existing HiddenTunes taxonomy alias." }; }
function band(confidence:number):TaxonomyConfidence { return confidence>=.9?"HIGH":confidence>=.6?"MEDIUM":"LOW"; }
export function classifyCanonicalTaxonomy(metadata:Record<string,unknown>):TaxonomyResult {
  const providerGenres=Array.isArray(metadata.genres)?metadata.genres.filter((entry):entry is string=>typeof entry==="string"&&Boolean(entry.trim())):[]; const normalizedGenres=providerGenres.map(key); const language=typeof metadata.language==="string"?metadata.language:null;
  if(!providerGenres.length) return {status:"TAXONOMY_FAIL",confidenceBand:"LOW",providerGenres,normalizedGenres,canonicalGenre:null,subgenre:null,mood:null,language,confidence:0,reasons:["Provider supplied no genre/tag to classify."]};
  const mapped=providerGenres.map((source)=>({source,mapping:mappingFor(source)})); const missing=mapped.filter((entry)=>!entry.mapping).map((entry)=>entry.source); const resolved=mapped.filter((entry):entry is {source:string;mapping:Mapping}=>Boolean(entry.mapping));
  if(!resolved.length) return {status:"TAXONOMY_REVIEW",confidenceBand:"LOW",providerGenres,normalizedGenres,canonicalGenre:null,subgenre:null,mood:null,language,confidence:0,reasons:["No provider genre mapped to the existing HiddenTunes taxonomy.",`Unmapped source values: ${missing.join(", ")}`]};
  const payloads=resolved.map((entry)=>buildNormalizedGenrePayload({mainGenreId:entry.mapping.mainGenreId,subgenreId:entry.mapping.subgenreId})).filter((entry):entry is NonNullable<typeof entry>=>Boolean(entry)); const unique=[...new Map(payloads.map((entry)=>[entry.subgenreId,entry])).values()]; const confidence=Math.min(...resolved.map((entry)=>entry.mapping.confidence)); const confidenceBand=band(confidence); const reasons=resolved.map((entry)=>entry.mapping.reason); if(missing.length) reasons.push(`Unmapped source values: ${missing.join(", ")}`); if(unique.length>1) reasons.push("Provider genres map to multiple canonical terms; review required."); const status=missing.length||unique.length!==1||confidenceBand!=="HIGH"?"TAXONOMY_REVIEW":"TAXONOMY_PASS";
  const chosen=unique[0]||null; return {status,confidenceBand,providerGenres,normalizedGenres,canonicalGenre:chosen?.mainGenre||null,subgenre:chosen?.subGenre||null,mood:null,language,confidence,reasons};
}
export function taxonomyUnmappedSourceValues(results:readonly TaxonomyResult[]):string[] { return [...new Set(results.flatMap((result)=>result.reasons.filter((reason)=>reason.startsWith("Unmapped source values:")).flatMap((reason)=>reason.replace(/^Unmapped source values:\s*/,"").split(", "))))].sort(); }