import { useEffect, useMemo, useState } from "react";

import { PODCAST_MATURE_SUBCATEGORIES } from "../constants/podcastMatureCategories";
import type { PodcastCategory } from "../constants/podcastCategories";

function matureSubToCategoryFromDef(
  sub: (typeof PODCAST_MATURE_SUBCATEGORIES)[number]
): PodcastCategory {
  return {
    id: sub.id,
    title: sub.title,
    subtitle: sub.subtitle,
    icon: sub.icon,
    gradient: sub.gradient,
    catalogQuery: sub.catalogQuery,
    fallbackQuery: sub.fallbackQuery,
    tier: "mature",
    isMature: true,
  };
}

/** Static mature podcast tiles — no availability probe storm on hub mount. */
export function useMaturePodcastCategoryAvailability(enabled: boolean) {
  const categories = useMemo(
    () =>
      enabled
        ? PODCAST_MATURE_SUBCATEGORIES.filter((sub) => sub.hubStandalone !== false).map(
            matureSubToCategoryFromDef
          )
        : [],
    [enabled]
  );

  const [loadingCategories] = useState(false);

  useEffect(() => {
    // Categories are catalog metadata only until a category page is opened.
  }, [enabled]);

  return { categories, loadingCategories };
}
