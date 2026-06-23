import { useEffect, useState } from "react";

import { PODCAST_MATURE_SUBCATEGORIES } from "../constants/podcastMatureCategories";
import type { PodcastCategory } from "../constants/podcastCategories";
import { filterAvailableMaturePodcastCategories } from "../services/mature/maturePodcastCategoryAvailability";

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

export function useMaturePodcastCategoryAvailability(enabled: boolean) {
  const [categories, setCategories] = useState<PodcastCategory[]>([]);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setCategories([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void filterAvailableMaturePodcastCategories()
      .then((available) => {
        if (cancelled) return;
        setCategories(available.map(matureSubToCategoryFromDef));
      })
      .catch(() => {
        if (cancelled) return;
        setCategories(PODCAST_MATURE_SUBCATEGORIES.map(matureSubToCategoryFromDef));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { categories, loadingCategories: loading };
}
