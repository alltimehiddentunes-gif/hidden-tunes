import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type UploaderRole = "owner" | "upload_manager";

type CreateUploaderProfileInput = {
  userId: string;
  email: string;
  role: UploaderRole;
};

export async function createUploaderProfile({
  userId,
  email,
  role,
}: CreateUploaderProfileInput) {
  const cleanEmail = email.trim().toLowerCase();

  const { data: existingProfile, error: existingProfileError } =
    await supabaseAdmin
      .from("uploader_profiles")
      .select("id, email, role, status")
      .or(`id.eq.${userId},email.eq.${cleanEmail}`)
      .maybeSingle();

  if (existingProfileError) {
    return {
      success: false,
      error: existingProfileError.message,
      profile: null,
    };
  }

  if (existingProfile) {
    return {
      success: false,
      error: "Uploader profile already exists.",
      profile: existingProfile,
    };
  }

  const { data: profile, error: insertError } = await supabaseAdmin
    .from("uploader_profiles")
    .insert({
      id: userId,
      email: cleanEmail,
      role,
      status: "active",
    })
    .select("id, email, role, status")
    .single();

  if (insertError) {
    return {
      success: false,
      error: insertError.message,
      profile: null,
    };
  }

  return {
    success: true,
    error: null,
    profile,
  };
}