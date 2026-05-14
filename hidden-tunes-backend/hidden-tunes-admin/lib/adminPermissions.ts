export type AdminRole = "owner" | "upload_manager" | "moderator";

export const ADMIN_ROLES: AdminRole[] = [
  "owner",
  "upload_manager",
  "moderator",
];

export function isAdminRole(value: unknown): value is AdminRole {
  return (
    value === "owner" ||
    value === "upload_manager" ||
    value === "moderator"
  );
}

export function canManageUploaders(role?: string | null) {
  return role === "owner";
}

export function canUploadMusic(role?: string | null) {
  return role === "owner" || role === "upload_manager";
}

export function canReviewContent(role?: string | null) {
  return role === "owner" || role === "moderator";
}