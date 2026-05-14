import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type UploaderRole = "owner" | "upload_manager";

export type CreateUploaderInput = {
  email: string;
  role: UploaderRole;
};

export type CreateUploaderResult =
  | {
      success: true;
      userId: string;
      email: string;
      role: UploaderRole;
    }
  | {
      success: false;
      error: string;
    };

export function normalizeUploaderEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function isAllowedUploaderRole(role: string): role is UploaderRole {
  return role === "owner" || role === "upload_manager";
}

export function generateTemporaryPassword() {
  const randomPart = globalThis.crypto.randomUUID().replace(/-/g, "");
  return `HiddenTunes-${randomPart.slice(0, 16)}!`;
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

export async function createSupabaseUploaderAuthUser(
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

  const temporaryPassword = generateTemporaryPassword();

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      role: input.role,
      created_by: "hidden_tunes_admin",
    },
  });

  if (error || !data.user) {
    return {
      success: false,
      error: error?.message || "Failed to create uploader auth user.",
    };
  }

  return {
    success: true,
    userId: data.user.id,
    email,
    role: input.role,
  };
}