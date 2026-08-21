import { getCurrentSupabaseAccessToken } from "./mobileSupabaseAuth";

const ACCOUNT_DELETION_URL = "https://admin.hiddentunes.com/api/account/delete";
const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";

export async function requestOwnAccountDeletion(): Promise<{ error: string | null }> {
  const session = await getCurrentSupabaseAccessToken();
  if (!session.accessToken) return { error: session.error || "Sign in again to delete your account." };

  try {
    const response = await fetch(ACCOUNT_DELETION_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ confirmation: ACCOUNT_DELETION_CONFIRMATION }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; deleted?: boolean };
    if (!response.ok || payload.deleted !== true) {
      const message = payload.error === "recent_authentication_required"
        ? "Sign in again immediately before deleting your account."
        : payload.error === "rate_limited"
          ? "Too many deletion attempts. Please wait and try again."
          : "Your account was not deleted. Please try again.";
      return { error: message };
    }
    return { error: null };
  } catch {
    return { error: "Could not reach Hidden Tunes. Your account and session are unchanged." };
  }
}
