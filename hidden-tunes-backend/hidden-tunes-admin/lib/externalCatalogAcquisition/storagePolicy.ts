import path from "node:path";
export type ExternalAcquisitionStoragePolicy = { root: string; raw: string; validated: string; quarantine: string; evidence: string; fingerprints: string; tmp: string };
const DEFAULT_ROOT = "D:\\HiddenTunes\\Data\\external-acquisition";
function rejectUnsafeRoot(root: string): string {
  const normalized = root.trim().replace(/[\\/]+$/, "");
  if (!normalized || /^[cC]:([\\/]|$)/.test(normalized)) throw new Error("External acquisition storage must use an explicit non-C: location.");
  if (normalized.includes("..")) throw new Error("External acquisition storage cannot contain parent traversal.");
  return normalized;
}
export function resolveStoragePolicy(env: NodeJS.ProcessEnv = process.env): ExternalAcquisitionStoragePolicy {
  const root = rejectUnsafeRoot(env.EXTERNAL_CATALOG_STORAGE_ROOT || DEFAULT_ROOT);
  return { root, raw: path.join(root, "raw"), validated: path.join(root, "validated"), quarantine: path.join(root, "quarantine"), evidence: path.join(root, "evidence"), fingerprints: path.join(root, "fingerprints"), tmp: path.join(root, "tmp") };
}
export function assertManagedStoragePath(filePath: string, policy: ExternalAcquisitionStoragePolicy): string {
  const resolvedRoot = path.resolve(policy.root).toLowerCase(); const resolvedPath = path.resolve(filePath).toLowerCase();
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("External acquisition path is outside managed staging storage.");
  return filePath;
}

