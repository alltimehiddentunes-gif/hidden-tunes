import { router } from "expo-router";

/** Prefer history; fall back to Lectures landing — never Home. */
export function goBackWithinLectures() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/lectures" as never);
}
