import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  IOS_OPERATIONAL_PLATFORM,
  getIosOperationalPolicySnapshot,
  subscribeIosOperationalPolicy,
  refreshIosOperationalPolicy,
  retainIosOperationalPolicyScheduler,
  iosOperationalSectionEnabled,
  iosOperationalRouteSection,
  isIosOperationalItemVisible,
  requestIosOperationalItemVisibility,
  type IosOperationalRef,
} from "../services/iosOperationalPolicy";

function routeEnabled(route: string) {
  const section = iosOperationalRouteSection(route);
  return !section || iosOperationalSectionEnabled(section);
}

export function useIosOperationalPolicy() {
  const snapshot = useSyncExternalStore(
    subscribeIosOperationalPolicy,
    getIosOperationalPolicySnapshot,
    getIosOperationalPolicySnapshot
  );
  useEffect(() => {
    if (!IOS_OPERATIONAL_PLATFORM) return;
    return retainIosOperationalPolicyScheduler();
  }, []);
  return useMemo(
    () => ({
      ...snapshot,
      sectionEnabled: iosOperationalSectionEnabled,
      itemVisible: isIosOperationalItemVisible,
      routeEnabled,
    }),
    [snapshot]
  );
}

/** No per-card timers; policy owners refresh and these subscriptions invalidate cached rows. */
export function useIosOperationalItemVisibility(ref: IosOperationalRef | null) {
  const snapshot = useSyncExternalStore(
    subscribeIosOperationalPolicy,
    getIosOperationalPolicySnapshot,
    getIosOperationalPolicySnapshot
  );
  const type = ref?.type;
  const id = ref?.id;
  useEffect(() => {
    if (!IOS_OPERATIONAL_PLATFORM) return;
    if (snapshot.status === "loading") {
      void refreshIosOperationalPolicy();
      return;
    }
    requestIosOperationalItemVisibility(type && id ? { type, id } : null);
  }, [type, id, snapshot.revision, snapshot.status]);
  return isIosOperationalItemVisible(ref);
}
