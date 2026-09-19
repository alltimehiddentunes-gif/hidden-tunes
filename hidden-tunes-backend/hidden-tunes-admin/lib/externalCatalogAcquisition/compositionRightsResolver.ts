import { sha256Hex } from "./provenance";
import type { RightsEvaluationInput } from "./types";
import type { CompositionRightsEvidence, CompositionRightsResult, CompositionRightsStatus } from "./qualificationTypes";
export type CompositionRightsResolverInput = { artist?: string | null; composer?: string | null; recordingRights: RightsEvaluationInput["recording"]; evidence?: CompositionRightsEvidence[]; explicitStatus?: CompositionRightsStatus };
const GREEN = new Set<CompositionRightsStatus>(["PUBLIC_DOMAIN_VERIFIED", "ORIGINAL_BY_RECORDING_ARTIST", "LICENSE_COVERS_COMPOSITION", "COMPOSITION_LICENSE_VERIFIED"]);
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function same(a: string | null, b: string | null): boolean { return Boolean(a && b && a.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === b.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()); }
export function resolveCompositionRights(input: CompositionRightsResolverInput): CompositionRightsResult {
  const evidence = input.evidence || []; const reliable = evidence.some((item) => item.reliable && Boolean(item.statement || item.sourceUrl));
  if (input.explicitStatus === "CONFLICT") return { status: "CONFLICT", reason: "Composition evidence conflicts.", evidence };
  if (input.explicitStatus === "REJECTED") return { status: "REJECTED", reason: "Composition rights were explicitly rejected.", evidence };
  if (input.explicitStatus && GREEN.has(input.explicitStatus) && reliable) return { status: input.explicitStatus, reason: "Composition rights were independently evidenced.", evidence };
  if (input.explicitStatus && input.explicitStatus !== "UNKNOWN") return { status: "CONFLICT", reason: "A positive composition status lacks reliable independent evidence.", evidence };
  return { status: "UNKNOWN", reason: "No independent composition-rights evidence was supplied.", evidence };
}
export function resolveCompositionRightsFromMetadata(metadata: Record<string, unknown>, capturedAt = new Date().toISOString()): CompositionRightsResult {
  const artist = text(metadata.artist); const composer = text(metadata.composer); const statements: string[] = [];
  for (const field of ["songwriter", "lyricist", "copyright", "description", "sourceCredits", "originalWorkDeclaration"]) { const value = text(metadata[field]); if (value) statements.push(`${field}: ${value}`); }
  const sourceUrl = text(metadata.sourceUrl); const evidence: CompositionRightsEvidence[] = statements.map((statement) => ({ sourceUrl, statement, capturedAt, evidenceHash: sha256Hex(statement), reliable: true }));
  const all = statements.join(" ").toLowerCase();
  if (/(public domain|domaine public|cc0|creative commons zero)/i.test(all)) return { status: "PUBLIC_DOMAIN_VERIFIED", reason: "Source metadata explicitly states public-domain/CC0 composition status.", evidence };
  const explicitOriginal = /(original (song|work|composition)|written and performed by|composed and performed by|all (songs|music|tracks) written by)/i.test(all);
  if (explicitOriginal && ((composer && same(composer, artist)) || /by the recording artist|by artist/i.test(all))) return { status: "ORIGINAL_BY_RECORDING_ARTIST", reason: "Source metadata explicitly declares an original work and identifies the recording artist as author.", evidence };
  if (/(composition|songwriting|musical work).{0,40}(covered|included|licensed)|license.{0,40}(composition|songwriting|musical work)/i.test(all)) return { status: "LICENSE_COVERS_COMPOSITION", reason: "Source metadata explicitly states that the applicable licence covers the composition.", evidence };
  if (/(composition license verified|verified composition licence|verified songwriting rights)/i.test(all)) return { status: "COMPOSITION_LICENSE_VERIFIED", reason: "Source metadata explicitly states verified composition licensing.", evidence };
  return { status: "UNKNOWN", reason: composer ? "Composer metadata was present, but no reliable statement established composition ownership or licence scope." : "No independent composition-rights evidence was supplied.", evidence };
}
export function compositionRightsIsGreen(result: CompositionRightsResult): boolean { return GREEN.has(result.status); }