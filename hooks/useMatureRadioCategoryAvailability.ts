import { useEffect, useState } from "react";

import type { RadioCategory } from "../constants/radioCategories";
import { filterAvailableMatureRadioCategories } from "../services/mature/matureRadioCategoryAvailability";

export function useMatureRadioCategoryAvailability(enabled: boolean) {
  const [categories, setCategories] = useState<RadioCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(enabled);

  useEffect(() => {
    if (!enabled) {
      setCategories([]);
      setLoadingCategories(false);
      return;
    }

    let cancelled = false;
    setLoadingCategories(true);

    void filterAvailableMatureRadioCategories()
      .then((available) => {
        if (cancelled) return;
        setCategories(available);
      })
      .catch(() => {
        if (cancelled) return;
        setCategories([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { categories, loadingCategories };
}
