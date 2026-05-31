import { useEffect, useRef, useState } from "react";

import {
  isSameSearchInputQuery,
  SEARCH_UI_DEBOUNCE_MS,
} from "./searchInputTiming";

export function useDebouncedValue<T>(
  value: T,
  delayMs = SEARCH_UI_DEBOUNCE_MS
): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const latestValueRef = useRef(value);

  latestValueRef.current = value;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(latestValueRef.current);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

export function useDebouncedSearchQuery(
  query: string,
  delayMs = SEARCH_UI_DEBOUNCE_MS
) {
  const [debouncedQuery, setDebouncedQuery] = useState(query.trim());
  const latestQueryRef = useRef(query);

  latestQueryRef.current = query;

  useEffect(() => {
    const trimmed = String(query || "").trim();

    if (isSameSearchInputQuery(debouncedQuery, trimmed)) {
      return;
    }

    const timer = setTimeout(() => {
      const next = String(latestQueryRef.current || "").trim();
      setDebouncedQuery((current) =>
        isSameSearchInputQuery(current, next) ? current : next
      );
    }, delayMs);

    return () => clearTimeout(timer);
  }, [debouncedQuery, delayMs, query]);

  return debouncedQuery;
}
