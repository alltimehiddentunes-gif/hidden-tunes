import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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

const DEFAULT_ADMIN_SITE_URL = "https://admin.hiddentunes.com";

function getAdminSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_ADMIN_SITE_URL
  );
}

export function normalizeUploaderEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function isAllowedUploaderRole(role: string): role is UploaderRole {
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

  const supabaseAdmin = getSupabaseAdmin();

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${getAdminSiteUrl()}/admin/login`,
      data: {
        role: input.role,
        created_by: "hidden_tunes_admin",
      },
    }
  );

  if (error) {
    return {
      success: false,
      error: error.message || "Failed to invite uploader auth user.",
    };
  }

  if (!data.user?.id) {
    return {
      success: false,
      error:
        "Supabase invite did not return an auth user id. Uploader profile was not created.",
    };
  }

  const { error: metadataError } = await supabaseAdmin.auth.admin.updateUserById(
    data.user.id,
    {
      user_metadata: {
        ...(data.user.user_metadata || {}),
        role: input.role,
        created_by: "hidden_tunes_admin",
      },
    }
  );

  if (metadataError) {
    return {
      success: false,
      error: metadataError.message || "Failed to update uploader metadata.",
    };
  }

  return {
    success: true,
    userId: data.user.id,
    email,
    role: input.role,
  };
}
