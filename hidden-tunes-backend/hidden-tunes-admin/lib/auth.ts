import { supabase } from "./supabaseClient";

export { supabase };

export type UploaderProfile = {
  id: string;
  email: string | null;
  role: string | null;
  status: string | null;
  [key: string]: unknown;
};

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
    profile: data as UploaderProfile | null,
    error,
  };
}

export async function getActiveUploaderSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return {
      session: null,
      profile: null,
    };
  }

  const { profile } = await getUploaderProfile(session.user.id);

  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();

    return {
      session: null,
      profile: null,
    };
  }

  return {
    session,
    profile,
  };
}
