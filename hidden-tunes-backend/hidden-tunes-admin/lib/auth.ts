import { supabase } from "./supabaseClient";

export { supabase };

export async function signInUploader(
  email: string,
  password: string
) {
  return supabase.auth.signInWithPassword({
    email,
    password,
  });
}

export async function signOutUploader() {
  return supabase.auth.signOut();
}

export async function getCurrentUploader() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getUploaderProfile(userId: string) {
  const { data, error } = await supabase
    .from("uploader_profiles")
    .select("*")
    .eq("id", userId)
    .single();

  console.log("UPLOADER PROFILE RESULT", {
    userId,
    data,
    error,
  });

  return {
    profile: data,
    error,
  };
}