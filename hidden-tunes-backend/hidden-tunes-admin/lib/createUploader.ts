import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type CreateUploaderInput = {
  email: string;
  role: "owner" | "upload_manager";
};

export type CreateUploaderResult =
  | {
      success: true;
      userId: string;
      email: string;
      role: "owner" | "upload_manager";
    }
  | {
      success: false;
      error: string;
    };

export function normalizeUploaderEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function isAllowedUploaderRole(
  role: string
): role is "owner" | "upload_manager" {
  return role === "owner" || role === "upload_manager";
}

export async function createUploaderPreview(
  input: CreateUploaderInput
): Promise<CreateUploaderResult> {
  const email = normalizeUploaderEmail(input.email);

  if (!email) {
    return {
      success: false,
      error: "Uploader email is required.",
    };
  }

  if (!isAllowedUploaderRole(input.role)) {
    return {
      success: false,
      error: "Invalid uploader role.",
    };
  }

  return {
    success: true,
    userId: "preview-only-no-user-created",
    email,
    role: input.role,
  };
}