import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query and re-render when it changes.
 * Uses useSyncExternalStore (the idiomatic way to read from an external
 * store like matchMedia) and is SSR-safe — returns `false` without a window.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = () =>
    typeof window !== "undefined" && window.matchMedia(query).matches;

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Convenience: true on phone/tablet-portrait widths (<= 768px). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 768px)");
}
