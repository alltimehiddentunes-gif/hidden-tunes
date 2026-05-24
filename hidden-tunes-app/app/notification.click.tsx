import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { resolveNotificationClickRoute } from "../utils/notificationClickRoute";
import { subscribeNowPlaying } from "../utils/nowPlayingStore";

export default function NotificationClickRedirect() {
  useEffect(() => {
    let cancelled = false;

    const redirect = () => {
      if (cancelled) return;
      router.replace(resolveNotificationClickRoute());
    };

    redirect();

    const unsubscribe = subscribeNowPlaying(() => {
      redirect();
    });

    const retryTimer = setTimeout(redirect, 150);

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      unsubscribe();
    };
  }, []);

  return <View style={{ flex: 1, backgroundColor: "#000" }} />;
}
