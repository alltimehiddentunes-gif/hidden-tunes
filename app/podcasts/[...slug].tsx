import { Redirect } from "expo-router";

export default function LegacyPodcastCatchAll() {
  return <Redirect href="/podcasts" />;
}
