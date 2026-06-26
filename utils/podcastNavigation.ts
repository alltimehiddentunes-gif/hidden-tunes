import { router } from "expo-router";

export function navigatePodcastBack(fallback: "/podcasts" | "/library" = "/podcasts") {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback as any);
}
