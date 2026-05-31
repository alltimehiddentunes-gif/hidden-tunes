import { memo, useEffect } from "react";

import { usePathname } from "expo-router";

import { setActiveWorldId } from "../state/emotionalFlowSettings";

function ActiveWorldRouteSync() {
  const pathname = usePathname();

  useEffect(() => {
    const match = pathname.match(/\/worlds\/([^/?#]+)/i);
    const worldId = match?.[1] ? decodeURIComponent(match[1]) : null;

    if (worldId) {
      setActiveWorldId(worldId);
    }
  }, [pathname]);

  return null;
}

export default memo(ActiveWorldRouteSync);
