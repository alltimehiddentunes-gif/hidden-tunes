import { useMemo, useState } from "react";

import { MATURE_RADIO_PRIMARY_GROUPS } from "../constants/matureRadioQueryGroups";
import type { RadioCategory } from "../constants/radioCategories";
import { matureRadioGroupToCategory } from "../constants/radioCategories";

/** Static mature radio tiles — no multi-category probe on hub mount. */
export function useMatureRadioCategoryAvailability(enabled: boolean) {
  const categories = useMemo(
    () =>
      enabled ? MATURE_RADIO_PRIMARY_GROUPS.map(matureRadioGroupToCategory) : ([] as RadioCategory[]),
    [enabled]
  );

  const [loadingCategories] = useState(false);

  return { categories, loadingCategories };
}
