export type AdminRole =
  | "owner"
  | "admin"
  | "upload_manager"
  | "uploader"
  | "creator"
  | "moderator";

export const ADMIN_ROLES: AdminRole[] = [
  "owner",
  "admin",
  "upload_manager",
  "uploader",
  "creator",
  "moderator",
];

export const UPLOAD_ROLES: AdminRole[] = [
  "owner",
  "admin",
  "upload_manager",
  "uploader",
  "creator",
];

export function isAdminRole(value: unknown): value is AdminRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "upload_manager" ||
    value === "uploader" ||
    value === "creator" ||
    value === "moderator"
  );
}

export function canManageUploaders(role?: string | null) {
  return role === "owner";
}

export function canManageUploaderOwnership(role?: string | null) {
  return role === "owner" || role === "admin";
}

export function canUploadMusic(role?: string | null) {
  return UPLOAD_ROLES.includes(role as AdminRole);
}

export function canReviewContent(role?: string | null) {
  return role === "owner" || role === "moderator";
}
