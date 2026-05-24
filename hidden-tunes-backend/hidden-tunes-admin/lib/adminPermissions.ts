export type AdminRole =
  | "owner"
  | "admin"
  | "upload_manager"
  | "uploader"
  | "creator"
  | "artist"
  | "moderator";

export const ADMIN_ROLES: AdminRole[] = [
  "owner",
  "admin",
  "upload_manager",
  "uploader",
  "creator",
  "artist",
  "moderator",
];

export const UPLOAD_ROLES: AdminRole[] = [
  "owner",
  "admin",
  "upload_manager",
  "uploader",
  "creator",
];

/** Roles allowed to open creator lyrics editors (server-enforced). */
export const CREATOR_LYRICS_ROLES: AdminRole[] = [
  "owner",
  "admin",
  "upload_manager",
  "uploader",
  "creator",
  "artist",
];

export function isAdminRole(value: unknown): value is AdminRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "upload_manager" ||
    value === "uploader" ||
    value === "creator" ||
    value === "artist" ||
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

export function canEditAllTrackLyrics(role?: string | null) {
  return canManageUploaderOwnership(role);
}

export function canUseCreatorLyricsHub(role?: string | null) {
  return (
    role === "artist" ||
    role === "uploader" ||
    role === "creator" ||
    role === "upload_manager"
  );
}

export function canAccessCreatorLyricsEditors(role?: string | null) {
  return CREATOR_LYRICS_ROLES.includes(role as AdminRole);
}

export function isArtistLyricsRole(role?: string | null) {
  return role === "artist" || role === "creator";
}
