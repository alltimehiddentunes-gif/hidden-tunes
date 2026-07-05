import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useWindowDimensions, type View } from "react-native";

const NEAR_VIEWPORT_MARGIN_PX = 160;

type CategoryScrollVisibilityContextValue = {
  subscribe: (listener: () => void) => () => void;
  windowHeight: number;
};

const CategoryScrollVisibilityContext =
  createContext<CategoryScrollVisibilityContextValue | null>(null);

type CategoryScrollVisibilityProviderProps = {
  children: ReactNode;
  scrollOffset: number;
};

export function CategoryScrollVisibilityProvider({
  children,
  scrollOffset,
}: CategoryScrollVisibilityProviderProps) {
  const { height: windowHeight } = useWindowDimensions();
  const listenersRef = useRef(new Set<() => void>());

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const value = useMemo(
    () => ({
      subscribe,
      windowHeight,
    }),
    [subscribe, windowHeight]
  );

  useEffect(() => {
    listenersRef.current.forEach((listener) => listener());
  }, [scrollOffset, windowHeight]);

  return (
    <CategoryScrollVisibilityContext.Provider value={value}>
      {children}
    </CategoryScrollVisibilityContext.Provider>
  );
}

export function useLazyCategoryArtwork(
  targetRef: RefObject<View | null>,
  artworkUrl?: string | null
) {
  const context = useContext(CategoryScrollVisibilityContext);
  const hasArtwork = Boolean(String(artworkUrl || "").trim());
  const [shouldLoad, setShouldLoad] = useState(false);

  const checkVisibility = useCallback(() => {
    if (!hasArtwork || shouldLoad) return;

    const node = targetRef.current;
    if (!node || typeof node.measureInWindow !== "function") return;

    node.measureInWindow((_x, y, _width, height) => {
      const viewportHeight = context?.windowHeight ?? 0;
      const margin = NEAR_VIEWPORT_MARGIN_PX;
      const isNearViewport =
        y + height >= -margin && y <= viewportHeight + margin;

      if (isNearViewport) {
        setShouldLoad(true);
      }
    });
  }, [context?.windowHeight, hasArtwork, shouldLoad, targetRef]);

  useEffect(() => {
    if (!hasArtwork || shouldLoad) return undefined;

    const unsubscribe = context?.subscribe(checkVisibility);
    const timer = setTimeout(checkVisibility, 0);

    return () => {
      unsubscribe?.();
      clearTimeout(timer);
    };
  }, [checkVisibility, context, hasArtwork, shouldLoad]);

  return shouldLoad;
}
